export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const fetchGroupMetadata = async (sock, groupId) => {
    let attempts = 0;
    while (true) {
        try {
            const metadata = await sock.groupMetadata(groupId);
            return metadata;
        } catch (error) {
            attempts++;
            console.error(`Erro ao buscar metadados do grupo ${groupId} (tentativa ${attempts}):`, error);
            console.log(`Aguardando 5 segundos antes de tentar novamente...`);
            await delay(5000);
        }
    }
};
