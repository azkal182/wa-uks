import { Client, LocalAuth } from 'whatsapp-web.js';
import mongoose from 'mongoose';
import qrcode from 'qrcode-terminal';

// Schema MongoDB untuk menyimpan session
const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    session: { type: Object },  // Data autentikasi klien
    isReady: { type: Boolean, default: false },  // Status klien
});

const Session = mongoose.model('Session', sessionSchema);

// Cache klien dan status di memori
export const clients: { [key: string]: { client: Client, isReady: boolean } } = {};

// Fungsi untuk membuat atau mengambil klien dari cache
export const createClient = async (sessionId: string, sessionData: any | null): Promise<Client> => {
    if (clients[sessionId]) {
        return clients[sessionId].client;  // Kembalikan klien yang ada jika sudah ada di memori
    }

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
    });

    clients[sessionId] = { client, isReady: false };  // Inisialisasi status di memori

    // Event saat QR code diterima
    client.on('qr', (qr: string) => {
        console.log(`QR untuk session ${sessionId}`);
        qrcode.generate(qr, { small: true });
    });

    // Event saat client siap
    client.on('ready', async () => {
        console.log(`WhatsApp client ready for session ${sessionId}`);
        clients[sessionId].isReady = true;  // Perbarui status di memori
        await Session.findOneAndUpdate({ sessionId }, { isReady: true }, { upsert: true });
    });

    // Event saat client terputus
    client.on('disconnected', async (reason) => {
        console.log(`WhatsApp client disconnected for session ${sessionId}: ${reason}`);
        clients[sessionId].isReady = false;  // Perbarui status di memori
        await Session.findOneAndUpdate({ sessionId }, { isReady: false });
    });

    // Event saat client terautentikasi
    client.on('authenticated', async (session) => {
        console.log(`Authenticated for session ${sessionId}`);
        await Session.findOneAndUpdate({ sessionId }, { session }, { upsert: true });
    });

    // Inisialisasi client jika ada data session
    if (sessionData) {
        await client.initialize();
    }

    return client;
};

// Fungsi untuk memeriksa dan menginisialisasi client
export const initializeClient = async (sessionId: string): Promise<Client> => {
    const session = await Session.findOne({ sessionId });

    if (session) {
        // Buat client dengan data dari database
        const client = await createClient(sessionId, session.session);
        clients[sessionId] = { client, isReady: session.isReady };

        // Jika belum ready, coba inisialisasi ulang
        if (!session.isReady) {
            await client.initialize();
        }

        return client;
    }

    // Jika tidak ada data sesi di database, buat client baru tanpa sesi
    return await createClient(sessionId, null);
};
