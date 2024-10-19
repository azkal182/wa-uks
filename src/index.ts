// // src/index.ts
import express, { type Request, type Response } from 'express';
import { Client, LocalAuth, MessageMedia, Buttons } from 'whatsapp-web.js';
import mongoose from 'mongoose';
import qrcode from 'qrcode-terminal';
import { Session } from './models/session';
import { phoneNumberFormatter } from './utils/formater';
import multer from 'multer';
import fs from "fs";
import path from "path";
import { getListPostren } from './lib/postren';
import { formatWhatsAppMessage } from './utils/whatsapp';

// Setup multer untuk menyimpan file sementara
const upload = multer({ dest: 'uploads/' }); // Tempat menyimpan file sementara
const app = express();
app.use(express.json());

// Koneksi ke MongoDB
mongoose.connect('mongodb://root:root@localhost:27017/whatsapp_sessions?authSource=admin')
    .then(() => console.log('Database connected'))
    .catch(err => console.error('Database connection failed', err));

interface IStartSessionRequest extends Request {
    body: {
        sessionId: string;
    };
}

interface ISendMessageRequest extends Request {
    body: {
        sessionId: string;
        number: string;
        message: string;
    };
}

const clients: { [key: string]: { client: Client, isReady: boolean } } = {};  // Cache client per session

// Fungsi untuk membuat client WhatsApp baru
const createClient = async (sessionId: string, sessionData: any | null): Promise<Client> => {

    if (clients[sessionId]) {
        return clients[sessionId].client; // Kembalikan client yang sudah ada
    }

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
    });

    clients[sessionId] = { client, isReady: false };

    client.on('qr', (qr: string) => {
        console.log(`QR untuk ${sessionId}:`);
        qrcode.generate(qr, { small: true });
    });

    client.on('message', async (message) => {
        if (message.body.toLocaleLowerCase().startsWith('uks list')) {
            getListPostren().then((data) => {
                const messageData = formatWhatsAppMessage(data);
                message.reply(messageData)
            })
        }

        if (message.body.toLocaleLowerCase().startsWith('data uks')) {
            getListPostren().then((data) => {
                const messageData = formatWhatsAppMessage(data);
                message.reply(messageData)
            })
        }
    })

    client.on('ready', () => {
        console.log(`WhatsApp ready for session ${sessionId}`);
        clients[sessionId].isReady = true;  // Tandai bahwa client sudah ready
    });

    client.on('authenticated', async (session: any) => {
        console.log(`Authenticated for session ${sessionId}`);
        await Session.findOneAndUpdate(
            { sessionId },
            { session },
            { upsert: true, new: true }
        );
    });

    client.on('disconnected', async (reason) => {
        console.log('Client disconnected:', reason);
        delete clients[sessionId];  // Hapus client dari cache saat disconnect
        await Session.deleteOne({ sessionId });
    });

    if (sessionData) {
        client.initialize();
    }

    return client;
};

// API untuk memulai sesi baru
app.post('/start-session', async (req: IStartSessionRequest, res: Response) => {
    const { sessionId } = req.body;

    let session = await Session.findOne({ sessionId });

    if (session) {
        console.log(`Menggunakan sesi yang ada untuk ${sessionId}`);
        const client = await createClient(sessionId, session.session);
        client.initialize();
    } else {
        console.log(`Membuat sesi baru untuk ${sessionId}`);
        const client = await createClient(sessionId, null);
        client.initialize();
    }

    res.status(200).json({ message: `Client initialized for session ${sessionId}` });
});

// API untuk mengirim pesan
// app.post('/send-message', async (req: ISendMessageRequest, res: express.Response) => {
//     const { sessionId, number, message } = req.body;

//     const session = await Session.findOne({ sessionId });

//     if (!session) {
//         return res.status(404).json({ error: 'Session not found' });
//     }

//     const client = await createClient(sessionId, session.session);
//     client.initialize();

//     client.on('ready', async () => {
//         client.sendMessage(`${number}@c.us`, message).then(response => {
//             res.status(200).json({ message: 'Message sent', response });
//         }).catch(err => {
//             res.status(500).json({ error: 'Failed to send message', err });
//         });
//     });
// });


app.post('/send-message', async (req: Request, res: Response) => {
    const { sessionId, number, message }: { sessionId: string, number: string, message: string } = req.body;

    const phoneNumber = phoneNumberFormatter(number)
    // Lanjutkan dengan logika Anda
    const session = await Session.findOne({ sessionId });

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    let clientData = clients[sessionId];

    if (!clientData) {
        // Jika clientData tidak ada, kita buat client baru dan coba inisialisasi
        const client = await createClient(sessionId, session.session);
        clientData = { client, isReady: false };
        clients[sessionId] = clientData;
    }

    // Jika client belum ready, coba inisialisasi
    if (!clientData.isReady) {
        try {
            await clientData.client.initialize();

            // Tunggu hingga client siap dengan promise atau timeout 10 detik
            const clientReady = await new Promise<boolean>((resolve, reject) => {
                const timeout = setTimeout(() => reject('Initialization timeout'), 10000); // Timeout 10 detik

                clientData.client.on('ready', () => {
                    clearTimeout(timeout);  // Hapus timeout jika sudah siap
                    clientData.isReady = true; // Tandai klien siap
                    resolve(true);
                });

                clientData.client.on('auth_failure', (msg) => {
                    clearTimeout(timeout);
                    reject(`Authentication failed: ${msg}`);
                });
            });

            if (!clientReady) {
                return res.status(500).json({ error: 'Client failed to initialize' });
            }
        } catch (err) {
            return res.status(500).json({ error: 'Client initialization failed', details: err });
        }
    }

    // Jika client siap, kirim pesan
    try {
        const response = await clientData.client.sendMessage(phoneNumber, message);
        res.status(200).json({ message: 'Message sent', response });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send message', details: err });
    }
});

app.post('/send-message-button', async (req: Request, res: Response) => {
    const { sessionId, number, message }: { sessionId: string, number: string, message: string } = req.body;

    const phoneNumber = phoneNumberFormatter(number)
    // Lanjutkan dengan logika Anda
    const session = await Session.findOne({ sessionId });

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    let clientData = clients[sessionId];

    if (!clientData) {
        // Jika clientData tidak ada, kita buat client baru dan coba inisialisasi
        const client = await createClient(sessionId, session.session);
        clientData = { client, isReady: false };
        clients[sessionId] = clientData;
    }

    // Jika client belum ready, coba inisialisasi
    if (!clientData.isReady) {
        try {
            await clientData.client.initialize();

            // Tunggu hingga client siap dengan promise atau timeout 10 detik
            const clientReady = await new Promise<boolean>((resolve, reject) => {
                const timeout = setTimeout(() => reject('Initialization timeout'), 10000); // Timeout 10 detik

                clientData.client.on('ready', () => {
                    clearTimeout(timeout);  // Hapus timeout jika sudah siap
                    clientData.isReady = true; // Tandai klien siap
                    resolve(true);
                });

                clientData.client.on('auth_failure', (msg) => {
                    clearTimeout(timeout);
                    reject(`Authentication failed: ${msg}`);
                });
            });

            if (!clientReady) {
                return res.status(500).json({ error: 'Client failed to initialize' });
            }
        } catch (err) {
            return res.status(500).json({ error: 'Client initialization failed', details: err });
        }
    }

    // Jika client siap, kirim pesan
    try {
        const buttonMessage = new Buttons('Button body', [{ body: 'bt1' }, { body: 'bt2' }, { body: 'bt3' }], 'title', 'footer');
        const response = await clientData.client.sendMessage(phoneNumber, buttonMessage);
        res.status(200).json({ message: 'Message sent', response });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send message', details: err });
    }
});

// API untuk mengirim gambar
app.post('/send-image', upload.single('image'), async (req: Request, res: Response) => {
    const { sessionId, number, caption }: { sessionId: string; number: string; caption?: string } = req.body;
    const imagePath = req.file?.path; // Ambil path file yang diupload

    if (!imagePath) {
        return res.status(400).json({ error: 'No image file provided' });
    }

    const phoneNumber = phoneNumberFormatter(number);

    // Cek apakah sesi ada di database
    const session = await Session.findOne({ sessionId });
    if (!session) {
        // Hapus file gambar yang tidak terpakai
        fs.unlink(imagePath, (err) => {
            if (err) {
                console.error('Failed to delete temporary file:', err);
            }
        });
        return res.status(404).json({ error: 'Session not found' });
    }

    let clientData = clients[sessionId];
    if (!clientData) {
        // Jika clientData tidak ada, kita buat client baru dan coba inisialisasi
        const client = await createClient(sessionId, session.session);
        clientData = { client, isReady: false };
        clients[sessionId] = clientData;
    }

    // Jika client belum ready, coba inisialisasi
    if (!clientData.isReady) {
        try {
            await clientData.client.initialize();

            // Tunggu hingga client siap dengan promise atau timeout 10 detik
            const clientReady = await new Promise<boolean>((resolve, reject) => {
                const timeout = setTimeout(() => reject('Initialization timeout'), 10000); // Timeout 10 detik

                clientData.client.on('ready', () => {
                    clearTimeout(timeout); // Hapus timeout jika sudah siap
                    clientData.isReady = true; // Tandai klien siap
                    resolve(true);
                });

                clientData.client.on('auth_failure', (msg) => {
                    clearTimeout(timeout);
                    reject(`Authentication failed: ${msg}`);
                });
            });

            if (!clientReady) {
                // Hapus file gambar yang tidak terpakai
                fs.unlink(imagePath, (err) => {
                    if (err) {
                        console.error('Failed to delete temporary file:', err);
                    }
                });
                return res.status(500).json({ error: 'Client failed to initialize' });
            }
        } catch (err) {
            // Hapus file gambar yang tidak terpakai
            fs.unlink(imagePath, (err) => {
                if (err) {
                    console.error('Failed to delete temporary file:', err);
                }
            });
            return res.status(500).json({ error: 'Client initialization failed', details: err });
        }
    }

    // Jika client siap, kirim gambar
    try {
        const mediaData = fs.readFileSync(imagePath);
        const attachment = mediaData.toString('base64')
        const mimetype = 'image/jpeg'
        const media = new MessageMedia(mimetype, attachment, 'Media');

        const response = await clientData.client.sendMessage(phoneNumber, media, { caption: caption || '' });

        // Hapus file gambar setelah berhasil dikirim
        fs.unlink(imagePath, (err) => {
            if (err) {
                console.error('Failed to delete temporary file:', err);
            }
        });

        res.status(200).json({ message: 'Image sent', response });
    } catch (err) {
        // Hapus file gambar jika terjadi kesalahan saat mengirim
        fs.unlink(imagePath, (err) => {
            if (err) {
                console.error('Failed to delete temporary file:', err);
            }
        });
        res.status(500).json({ error: 'Failed to send image', details: err });
    }
});


// Mulai server
app.listen(3000, () => {
    console.log('Server berjalan di port 3000');
});


// import express, { type Request, type Response } from 'express';
// import mongoose from 'mongoose';
// import { clients, initializeClient } from './lib/client-manager';
// import { phoneNumberFormatter } from './utils/formater';


// const app = express();
// app.use(express.json());

// // Koneksi ke MongoDB
// mongoose.connect('mongodb://root:root@localhost:27017/whatsapp_sessions?authSource=admin')
//     .then(() => console.log('Database connected'))
//     .catch(err => console.error('Database connection failed', err));


// // Endpoint untuk mengirim pesan
// app.post('/send-message', async (req: Request, res: Response) => {
//     const { sessionId, number, message } = req.body;
//     const phoneNumber = phoneNumberFormatter(number)

//     try {
//         // Ambil atau inisialisasi klien berdasarkan sessionId
//         const client = await initializeClient(sessionId);

//         // Periksa apakah klien sudah ready
//         if (!client || !clients[sessionId].isReady) {
//             // Coba inisialisasi ulang jika belum siap
//             await client.initialize();

//             // Tunggu client sampai ready (misal: dengan timeout)
//             const clientReady = await new Promise<boolean>((resolve, reject) => {
//                 const timeout = setTimeout(() => reject('Initialization timeout'), 10000);

//                 client.on('ready', () => {
//                     clearTimeout(timeout);
//                     resolve(true);
//                 });

//                 client.on('auth_failure', (msg) => {
//                     clearTimeout(timeout);
//                     reject(`Authentication failed: ${msg}`);
//                 });
//             });

//             if (!clientReady) {
//                 return res.status(500).json({ error: 'Client failed to initialize' });
//             }
//         }

//         // Kirim pesan jika klien siap
//         const response = await client.sendMessage(phoneNumber, message);
//         res.status(200).json({ message: 'Message sent', response });
//     } catch (err) {
//         console.error('Error sending message:', err);
//         res.status(500).json({ error: 'Failed to send message', details: err });
//     }
// });

// // Jalankan server di port 3000
// app.listen(3000, () => {
//     console.log('Server started on port 3000');
// });
