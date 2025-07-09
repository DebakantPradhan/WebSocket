import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

function createRoom() {
	const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
	console.log(`Created room: ${roomId}`);
	return roomId;
}

interface SocketInfo {
	username: string;
	// "roomId": string,			//actually stored in map key
	socket: WebSocket;
}

interface userMessage {
	messageType: 'join' | 'createRoom' | 'chat';
	payload?: {
		username?: string;
		roomId?: string;
		message?: string;
	};
}

interface serverMessage {
	messageType: 'connection' | 'chat' | 'joined' | 'error';
	payload: {
		roomId?: string;
	};
}

type AllSocket = Map<string, SocketInfo[]>;

let allSockets: AllSocket = new Map<string, SocketInfo[]>();

wss.on('connection', (socket) => {
	console.log('new client connected');
	socket.on('message', (rawData) => {
		
		// console.log(rawData.toString());

		try {
			const data = JSON.parse(rawData.toString());

			if (data.messageType === 'createRoom') {
				const roomId = createRoom();

				allSockets.set(roomId, []);

				if (data.payload?.username) {
					allSockets.get(roomId)!.push({
						username: data.payload.username,
						socket: socket,
					});
				}

				const response: serverMessage = {
					messageType: 'connection',
					payload: {
						roomId: roomId,
					},
				};

				socket.send(JSON.stringify(response));
			}

			if (data.messageType === 'join') {
				const roomId = data.payload.roomId;
				const username = data.payload?.username;

				if (!roomId || !username) {
					socket.send(
						JSON.stringify({
							messageType: 'error',
							payload: { message: 'Missing roomId or username' },
						})
					);
					return;
				}

				if (!allSockets.has(roomId)) {
					socket.send(
						JSON.stringify({
							messageType: 'error',
							payload: { message: `Room ${roomId} does not exist` },
						})
					);
					return;
				}

				// Check if user already in room
                const roomUsers = allSockets.get(roomId)!;
                const existingUser = roomUsers.find(user => user.socket === socket);

				if (existingUser) {
                    socket.send(JSON.stringify({
                        messageType: 'error',
                        payload: { message: 'Already in this room' }
                    }));
                    return;
                }

				// Add user to room
                roomUsers.push({
                    username: username,
                    socket: socket
                });

				console.log(`${username} joined room ${roomId}`);

				socket.send(JSON.stringify({
                    messageType: 'joined',
                    payload: { 
                        roomId: roomId,
                        message: `Successfully joined room ${roomId}` 
                    }
                }));

				 // Notify others in room
                broadcastToRoom(roomId, `${username} joined the room`, socket);
			}

			if (data.messageType == 'chat') {
				const roomId = data.payload.roomId;
				const username = data.payload?.username;
                const message = data.payload?.message;
				const roomUsers = allSockets.get(roomId as string);

				if (!roomId || !username || !message) {
                    socket.send(JSON.stringify({
                        messageType: 'error',
                        payload: { message: 'Missing required chat data' }
                    }));
                    return;
                }

				// Check if room exists
                if (!allSockets.has(roomId)) {
                    socket.send(JSON.stringify({
                        messageType: 'error',
                        payload: { message: `Room ${roomId} does not exist` }
                    }));
                    return;
                }

				 // Broadcast message to all users in room (including sender)
                broadcastToRoom(roomId, `${username}: ${message}`);
					
			}
		} catch (error) {
			console.error('JSON Parse Error:', error);
            socket.send(JSON.stringify({
                messageType: 'error',
                payload: { message: 'Invalid JSON format' }
            }));
		}
	});

	socket.on('error', console.error);

	socket.on('close', () => {
        console.log('Client disconnected');
        removeSocketFromAllRooms(socket);
    });

	// socket.on('message', function message(data) {
	// 	console.log('received: %s', data);
	// 	for (const skt of allSockets) {
	// 		skt.send(`from user:${data}`);
	// 	}
	// });

	// socket.on('disconnect', () => {
	// 	allSockets = allSockets.filter((x) => x != socket);
	// });
});

// Helper function to broadcast message to all users in a room
function broadcastToRoom(roomId: string, message: string, excludeSocket?: WebSocket) {
    const roomUsers = allSockets.get(roomId);
    if (!roomUsers) return;

    roomUsers.forEach(user => {
        if (user.socket.readyState === WebSocket.OPEN && user.socket !== excludeSocket) {
            user.socket.send(JSON.stringify({
                messageType: 'chat',
                payload: { message: message }
            }));
        }
    });
}

// Helper function to remove socket from all rooms when disconnected
function removeSocketFromAllRooms(socket: WebSocket) {
    allSockets.forEach((users, roomId) => {
        const userToRemove = users.find(user => user.socket === socket);
        if (userToRemove) {
            // Remove user from room
            const updatedUsers = users.filter(user => user.socket !== socket);
            
            if (updatedUsers.length === 0) {
                // Delete empty room
                allSockets.delete(roomId);
                console.log(`Room ${roomId} deleted (empty)`);
            } else {
                allSockets.set(roomId, updatedUsers);
                // Notify remaining users
                broadcastToRoom(roomId, `${userToRemove.username} left the room`);
            }
        }
    });
}
