export function formatWhatsAppMessage(groupedData: any) {
    let message = '';

    for (const [asramaId, students] of Object.entries(groupedData)) {
        message += `*Asrama: ${asramaId}*\n`;  // Asrama ID sebagai heading
        // @ts-ignore
        students.forEach((student, index) => {
            const { name } = student.Student
            const kelas = student.Kelas
            let keluhans = student.Keluhan
            keluhans = keluhans.map((keluhan: any) => keluhan.name).join(', ')
            // console.log(kelas)
            message += `${index + 1}. ${name}, ${keluhans}, ${kelas ? kelas : "Tidak Sekolah"}\n`;
        });

        message += '\n';  // Tambahkan baris kosong antara asrama yang berbeda
    }

    return message;
}
