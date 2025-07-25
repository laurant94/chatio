// websocket/handler.js
const messageHandlers = require('./message');

/**
 * Configure et gère les événements du serveur WebSocket.
 * @param {WebSocket.Server} wss L'instance du serveur WebSocket.
 * @param {string} apiBaseUrl L'URL de base de l'API Laravel.
 */
function setupWebSocketHandler(wss, apiBaseUrl) {
    wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress || 'unknown';
        console.log(`Un client WebSocket s'est connecté depuis ${clientIp}.`);

        ws.on('message', async (message) => {
            const messageString = message.toString();
            console.log(`Message reçu du client (${clientIp}): ${messageString}`);

            try {
                const parsedMessage = JSON.parse(messageString);
                // On s'attend à ce que le client envoie son userId avec ces événements
                const userId = parsedMessage.userId; // Flutter doit envoyer {"event": "joinLobby", "data": "...", "userId": 123}

                if (!userId && (parsedMessage.event === 'joinConversation' || parsedMessage.event === 'joinLobby')) {
                     console.warn(`User ID manquant pour l'événement ${parsedMessage.event} de ${clientIp}.`);
                     ws.send(JSON.stringify({ event: 'error', message: 'User ID manquant.' }));
                     return;
                }

                switch (parsedMessage.event) {
                    case 'joinConversation':
                        messageHandlers.handleJoinConversation(ws, parsedMessage.data, clientIp, userId);
                        break;
                    case 'sendMessage':
                        await messageHandlers.handleSendMessage(ws, parsedMessage.data, apiBaseUrl);
                        break;
                    case 'joinLobby':
                        messageHandlers.handleJoinLobby(ws, clientIp, userId);
                        break;
                    default:
                        console.log(`Type d'événement non reconnu de ${clientIp}:`, parsedMessage.event);
                        ws.send(JSON.stringify({ event: 'error', message: 'Type d\'événement non reconnu.' }));
                        break;
                }

            } catch (e) {
                console.error(`Erreur lors du parsing du message JSON de ${clientIp}:`, e);
                ws.send(JSON.stringify({ event: 'error', message: 'Format de message invalide.' }));
            }
        });

        ws.on('close', () => {
            console.log(`Un client WebSocket s'est déconnecté depuis ${clientIp}.`);
            messageHandlers.removeClientFromAllConversations(ws, clientIp);
        });

        ws.on('error', (error) => {
            console.error(`Erreur WebSocket pour le client ${clientIp}: ${error.message}`);
        });
    });
}

module.exports = setupWebSocketHandler;