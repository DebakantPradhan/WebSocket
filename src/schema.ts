// user message schema //

// join room 
interface join{
    "messageType": "join" | "createRoom";
    "payload":{
        "username": string,
        "room": string,
        // "message":string,       
    }
}
// message
interface message{
    "messageType" : "chat";
    "payload":{
        "username":string,
        "room": string,
        "message":string
    }
}


// server send to user schema //

interface forwardMessage{
    "messageType":"chat";
    "payload":{
        "senderId": string,
        "message": string
    }
}

interface connectionInfo{
    "messageType":"connection";
    "payload":{
        "users":string[],
        "roomId" : string;
    }
}
