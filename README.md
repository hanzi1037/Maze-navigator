## Maze Navigator

An interactive maze creator and solver. Users draw a maze, set start/end points, pick an algorithm, and watch the robot solve it. Supported algorithms: DFS, BFS, Dijkstra, A* (Manhattan). Explored edges and the final path are visualized. Firebase powers auth, saving mazes, and a leaderboard.

Repository: [`hanzi1037/Maze-navigator`](https://github.com/hanzi1037/Maze-navigator.git)

### Prerequisites

- Node.js 18+ and npm 9+
- A Firebase project with Firestore and Authentication enabled

### Setup

```bash
git clone https://github.com/hanzi1037/Maze-navigator.git
cd Maze-navigator
npm install
```

Open `src/App.js` and set your Firebase web config:

```js
const firebaseConfig = {
  apiKey: "<YOUR_API_KEY>",
  authDomain: "<YOUR_PROJECT>.firebaseapp.com",
  projectId: "<YOUR_PROJECT_ID>",
  storageBucket: "<YOUR_PROJECT>.appspot.com",
  messagingSenderId: "<SENDER_ID>",
  appId: "<APP_ID>"
};
```

Enable in Firebase Console:
- Authentication → Sign-in method → Email/Password enabled (anonymous optional)
- Firestore Database → Enable

Used Firestore paths:
- `artifacts/{appId}/public/data/mazes`
- `artifacts/{appId}/public/data/leaderboards`
- `artifacts/{appId}/users/{uid}/profile/data`

### Run

```bash
npm start
```

Open `http://localhost:3000`.

### Build

```bash
npm run build
```

### Use

1. Sign in or continue anonymously
2. Draw walls, set Start (A) and End (B)
3. Choose DFS/BFS/Dijkstra/A*
4. Click Find Path to animate; edges show exploration, red line shows final path
5. Save/load mazes; like mazes; leaderboard records time, blocks, algorithm

### Tech

- React, Tailwind CSS
- Firebase Auth and Firestore

### Troubleshooting

- Auth errors: enable Email/Password; verify Firebase config
- Firestore permission errors: check rules and `appId`
