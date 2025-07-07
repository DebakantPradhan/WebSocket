import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

let userNo = 0;

let allSockets = [];
wss.on('connection', (socket) => {
	userNo++;

	allSockets.push(socket);

	console.log('user#%n connected', userNo);

	socket.on('error', console.error);

	socket.on('message', function message(data) {
		console.log('received: %s', data);
		for(const skt of allSockets){
			skt.send(`from server:${data}`)
		}
	});
});
