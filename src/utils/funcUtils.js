export const sendMessageWithRetry = async (sock, chatId, message, retries = 3) => {
    try {
        await sock.sendMessage(chatId, message);
    } catch (error) {
        if (retries > 0 && error.message.includes('rate-overlimit')) {
            console.log(`Rate limit atingido. Tentando novamente em 5 segundos... (${retries} tentativas restantes)`);
            await delay(5000); 
            return sendMessageWithRetry(sock, chatId, message, retries - 1);
        }
        throw error; 
    }
};
