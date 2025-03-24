export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const fetchGroupMetadata = async (sock, groupId, maxRetries = 3) => {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            const metadata = await sock.groupMetadata(groupId);
            return metadata;
        } catch (error) {
            attempts++;
            console.error(`Erro ao buscar metadados do grupo ${groupId} (tentativa ${attempts}):`, error);
            if (attempts >= maxRetries) {
                throw new Error(`Falha ao buscar metadados do grupo ${groupId} após ${maxRetries} tentativas.`);
            }
        }
    }
};

export const handleGroupMetadata = async (sock, chatId, retries = 3) => {
    try {
        return await fetchGroupMetadata(sock, chatId, retries);
    } catch (error) {
        console.error('Erro ao obter metadata do grupo:', error);
        if (retries > 0 && error.message.includes('rate-overlimit')) {
            console.log('Tentando novamente em 5 segundos...');
            await delay(3000);
            return handleGroupMetadata(sock, chatId, retries - 1);
        }
        return null;
    }
};