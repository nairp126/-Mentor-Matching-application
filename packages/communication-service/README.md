# Communication Service

## 1. Purpose & Responsibility

**What this module does**:
Facilitates real-time interaction between users. It powers Text Chat (Conversations/Messages) and Video Calling (WebRTC Signaling).

**Why it exists**:
To isolate stateful WebSocket connections and high-throughput message processing from standard REST API services.

## 2. Core Components & Structure

- **`index.ts`**: Initializes both `express` (REST) and `socket.io` (Real-time) servers on the same port.
- **`services/`**:
  - `socketManager.ts`: Handles WS connections, rooms, and event dispatching.
  - `videoCallService.ts`: Manages WebRTC signaling metadata (Offer/Answer/Candidate).
- **`routes/`**:
  - `messages.ts`: REST endpoints for chat history.
  - `files.ts`: Handling attachment uploads.

## 3. Implementation Details

- **Hybrid Server**: Runs HTTP and WS side-by-side.
- **Socket.IO**: Uses "Rooms" (Conversation IDs) to broadcast messages to specific participants.
- **Video Calls**: Does NOT stream video. Instead, it acts as a **Signaling Server** to help peers exchange connection details for P2P streaming.

## 4. Inter-Module Communication

- **Inputs**: WebSocket Events (`join_room`, `send_message`) and HTTP POSTs.
- **Outputs**: Emits real-time events to connected clients.
- **Dependencies**:
  - `Socket.IO`: Real-time engine.
  - `PostgreSQL`: Stores persistence chat history.

## 5. Usage Example

**Client-Side Socket Connection**:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3005", {
  auth: { token: "user_jwt" }
});

socket.emit("join_conversation", conversationId);
socket.on("new_message", (msg) => console.log(msg));
```
