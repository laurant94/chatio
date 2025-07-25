// server.js
require('dotenv').config(); // Charge les variables d'environnement du fichier .env
const http = require('http');
const WebSocket = require('ws');
const setupWebSocketHandler = require('./websocket/handler.js'); // Importe le gestionnaire WebSocket

const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL; // Récupère l'URL de l'API depuis .env

// Créer un serveur HTTP (nécessaire pour la mise à niveau du protocole vers WebSocket)
const server = http.createServer((req, res) => {
    // Si tu as des routes HTTP (par exemple, pour servir des pages web ou une API REST), tu les gérerais ici.
    // Pour l'instant, juste un message de base.
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Serveur WebSocket en marche !');
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Créer un serveur WebSocket en utilisant le serveur HTTP existant
const wss = new WebSocket.Server({ server });

// Appelle la fonction du gestionnaire WebSocket pour configurer les événements
// On passe l'instance wss et l'URL de l'API à ce handler.
setupWebSocketHandler(wss, API_BASE_URL);

// Démarrer le serveur HTTP qui écoute aussi les connexions WebSocket
server.listen(PORT, () => {
    console.log(`Serveur WebSocket écoutant sur le port ${PORT}`);
    console.log(`API_BASE_URL pour les requêtes Laravel: ${API_BASE_URL}`);
});