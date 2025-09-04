    /* global __firebase_config __app_id __initial_auth_token */
    import React, { useState, useEffect, useCallback, useRef } from 'react';
    import { initializeApp } from 'firebase/app';
    import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    signInAnonymously,
    signInWithCustomToken
    } from 'firebase/auth';
    import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    setDoc,
    updateDoc,
    query,
    where,
    getDoc,
    orderBy, // Imported orderBy
    limit,   // Imported limit
    } from 'firebase/firestore';

    // Define cell types for clarity and easier management
    const CELL_TYPE = {
    EMPTY: 0,
    WALL: 1,
    START: 2,
    END: 3,
    PATH: 4, // For the AI's calculated path
    VISITED: 5, // For nodes explored by the AI during search
    };

    // Component for a single maze cell
    const Cell = React.memo(({ type, onMouseDown, onMouseEnter, isPath, isVisited, isRobot, row, col, nodeInfo, showNodeMarkings, onNodeClick }) => {
    let bgColor = 'bg-gray-200'; // Default empty cell
    let textColor = 'text-gray-800';
    let icon = '';
    let nodeNumber = '';
    let nodeType = '';

    // Get node information if available
    const nodeKey = `${row},${col}`;
    const currentNodeInfo = nodeInfo.get(nodeKey);

    if (isRobot) {
        icon = '🤖'; // Robot emoji
        bgColor = 'bg-blue-600'; // Robot's cell color
        textColor = 'text-white';
    } else {
        switch (type) {
        case CELL_TYPE.WALL:
            bgColor = 'bg-gray-800';
            break;
        case CELL_TYPE.START:
            bgColor = 'bg-green-500';
            textColor = 'text-white';
            icon = 'A'; // Start point marker
            break;
        case CELL_TYPE.END:
            bgColor = 'bg-red-500';
            textColor = 'text-white';
            icon = 'B'; // End point marker
            break;
        case CELL_TYPE.PATH:
            bgColor = 'bg-blue-400'; // Path taken by AI
            break;
        case CELL_TYPE.VISITED:
            bgColor = 'bg-yellow-200'; // Cells explored by AI
            break;
        default:
            // If it's part of the path or visited during AI movement
            if (isPath) {
            bgColor = 'bg-blue-400';
            } else if (isVisited) {
            bgColor = 'bg-yellow-200';
            }
            break;
        }
    }

    // Add node marking information
    if (showNodeMarkings && currentNodeInfo) {
        nodeNumber = currentNodeInfo.order || '';
        nodeType = currentNodeInfo.type || '';
        
        // Add visual indicators for different node types
        if (currentNodeInfo.type === 'root') {
            bgColor = 'bg-purple-600';
            textColor = 'text-white';
        } else if (currentNodeInfo.type === 'parent') {
            bgColor = 'bg-indigo-500';
            textColor = 'text-white';
        } else if (currentNodeInfo.type === 'child') {
            bgColor = 'bg-cyan-500';
            textColor = 'text-white';
        } else if (currentNodeInfo.type === 'leaf') {
            bgColor = 'bg-orange-500';
            textColor = 'text-white';
        }
    }

    const handleClick = (e) => {
        if (showNodeMarkings && currentNodeInfo) {
            e.stopPropagation();
            onNodeClick(currentNodeInfo, row, col);
        } else {
            onMouseDown();
        }
    };

    return (
        <div
        className={`flex flex-col items-center justify-center w-full h-full cursor-pointer transition-colors duration-100 ${bgColor} ${textColor} text-xl select-none relative`}
        onMouseDown={handleClick}
        onMouseEnter={onMouseEnter}
        draggable="false"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(209, 213, 219, 1)' }}
        >
        {icon}
        {showNodeMarkings && nodeNumber && (
            <div className="absolute top-0 left-0 text-xs bg-black bg-opacity-50 text-white px-1 rounded-br">
                {nodeNumber}
            </div>
        )}
        {showNodeMarkings && nodeType && (
            <div className="absolute bottom-0 right-0 text-xs bg-black bg-opacity-50 text-white px-1 rounded-tl">
                {nodeType.charAt(0).toUpperCase()}
            </div>
        )}
        </div>
    );
    });

    // Custom Modal Component for alerts and loading mazes
    const Modal = ({ show, title, message, children, onClose }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">{title}</h2>
            {message && <p className="mb-4 text-gray-700">{message}</p>}
            {children}
            <div className="flex justify-end mt-4">
            <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-colors"
            >
                Close
            </button>
            </div>
        </div>
        </div>
    );
    };

    // Helper function to get cells along a line (Bresenham-like for grid)
    const getCellsInLine = (start, end) => {
    const cells = [];
    let x0 = start.col; // Using col as x, row as y for typical Cartesian
    let y0 = start.row;
    let x1 = end.col;
    let y1 = end.row;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = (x0 < x1) ? 1 : -1;
    const sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    while (true) {
        cells.push({ row: y0, col: x0 });

        if (x0 === x1 && y0 === y1) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
        err -= dy;
        x0 += sx;
        }
        if (e2 < dx) {
        err += dx;
        y0 += sy;
        }
    }
    return cells;
    };

    // Main App component
    const App = () => {
    const GRID_SIZE = 10; // 10x10 maze grid
    const [grid, setGrid] = useState([]);
    const [startNode, setStartNode] = useState(null);
    const [endNode, setEndNode] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [mode, setMode] = useState('drawWall'); // 'drawWall', 'setStart', 'setEnd', 'eraseWall', or null for idle
    const [message, setMessage] = useState('Click and drag to draw walls. Use buttons below to change mode.');
    const [aiPath, setAiPath] = useState([]);
    const [aiVisited, setAiVisited] = useState([]);
    const [aiEdges, setAiEdges] = useState([]); // Connections explored during search
    const [isPathfinding, setIsPathfinding] = useState(false);
    const [robotPosition, setRobotPosition] = useState(null);
    const [selectedAlgorithm, setSelectedAlgorithm] = useState('DFS');
    
    // Node marking states
    const [nodeInfo, setNodeInfo] = useState(new Map()); // Map of node coordinates to node information
    const [showNodeMarkings, setShowNodeMarkings] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null); // Currently selected node for details

    // New state for line drawing functionality
    const [startDrawingCell, setStartDrawingCell] = useState(null);
    const [currentHoveredCell, setCurrentHoveredCell] = useState(null);

    // New state for pathfinding statistics
    const [timeTaken, setTimeTaken] = useState(null); // Time in milliseconds
    const [blocksCovered, setBlocksCovered] = useState(null); // Number of cells visited

    // Firebase state
    const [user, setUser] = useState(null);
    const [userId, setUserId] = useState('Loading...');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authMessage, setAuthMessage] = useState('');
    const [isAuthReady, setIsAuthReady] = useState(false); // To track Firebase auth initialization
    
    // New Entity States
    const [userProfile, setUserProfile] = useState(null); // Stores UserProfile data
    const [displayName, setDisplayName] = useState(''); // Corrected: Initialized with useState('')
    const [leaderboardEntries, setLeaderboardEntries] = useState([]); // Stores top leaderboard entries
    const [selectedMazeId, setSelectedMazeId] = useState(null); // To track which maze is currently loaded for rating

    // Maze storage state
    const [availableMazes, setAvailableMazes] = useState([]);
    const [showLoadMazeModal, setShowLoadMazeModal] = useState(false);
    const [mazeNameToSave, setMazeNameToSave] = useState('');

    // Custom alert modal state
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [infoMessage, setInfoMessage] = useState('');
    const [infoModalTitle, setInfoModalTitle] = useState('');

    const pathfindingTimeoutRef = useRef(null);
    const robotAnimationTimeoutRef = useRef(null);
    const edgesRef = useRef([]);

    // Firebase initialization and auth listener
    const dbRef = useRef(null);
    const authRef = useRef(null);
    const appIdRef = useRef(null);

    // Helper to get collection paths
    const getPublicMazesCollectionRef = useCallback(() => {
        if (!dbRef.current || !appIdRef.current) return null;
        return collection(dbRef.current, `artifacts/${appIdRef.current}/public/data/mazes`);
    }, []);

    const getUserProfileDocRef = useCallback((uid) => {
        if (!dbRef.current || !appIdRef.current) return null;
        return doc(dbRef.current, `artifacts/${appIdRef.current}/users/${uid}/profile/data`);
    }, []);

    const getLeaderboardCollectionRef = useCallback(() => {
        if (!dbRef.current || !appIdRef.current) return null;
        return collection(dbRef.current, `artifacts/${appIdRef.current}/public/data/leaderboards`);
    }, []);

    const getMazeRatingsCollectionRef = useCallback((mazeId) => {
        if (!dbRef.current || !appIdRef.current) return null;
        return collection(dbRef.current, `artifacts/${appIdRef.current}/public/data/mazes/${mazeId}/ratings`);
    }, []);

    // --- User Profile Management ---
    const fetchOrCreateUserProfile = useCallback(async (uid, email) => {
        if (!dbRef.current) return;
        const profileRef = getUserProfileDocRef(uid);
        const docSnap = await getDoc(profileRef);

        if (docSnap.exists()) {
        setUserProfile(docSnap.data());
        setDisplayName(docSnap.data().displayName || email.split('@')[0]);
        } else {
        // Create a new profile if it doesn't exist (e.g., first login or anonymous)
        const defaultProfile = {
            displayName: email ? email.split('@')[0] : `Guest${uid.substring(0, 4)}`,
            createdAt: new Date(),
            lastLogin: new Date(),
            totalMazesCreated: 0,
            totalMazesSolved: 0,
        };
        await setDoc(profileRef, defaultProfile);
        setUserProfile(defaultProfile);
        setDisplayName(defaultProfile.displayName);
        }
    }, [getUserProfileDocRef]);

    // Function to handle node click for showing details
    const handleNodeClick = useCallback((nodeInfo, row, col) => {
        setSelectedNode({
            ...nodeInfo,
            row,
            col
        });
    }, []);

    // Function to erase a single wall
    const eraseWall = useCallback((row, col) => {
        setGrid(prevGrid => {
        const newGrid = prevGrid.map(arr => [...arr]);
        // Only erase if it's actually a wall and not a start/end node
        if (newGrid[row][col] === CELL_TYPE.WALL) {
            newGrid[row][col] = CELL_TYPE.EMPTY;
            setMessage(`Wall at (${row}, ${col}) erased.`);
            // Clear path/robot if maze is modified
            setAiPath([]);
            setAiVisited([]);
            setAiEdges([]);
            setRobotPosition(null);
            if (robotAnimationTimeoutRef.current) {
            clearTimeout(robotAnimationTimeoutRef.current);
            }
        } else {
            setMessage('No wall to erase here.');
        }
        return newGrid;
        });
    }, []);

    // Set the start node
    const setStart = useCallback((row, col) => {
        setGrid(prevGrid => {
        const newGrid = prevGrid.map(arr => [...arr]);

        if (startNode) {
            newGrid[startNode.row][startNode.col] = CELL_TYPE.EMPTY;
        }

        if (newGrid[row][col] === CELL_TYPE.WALL || newGrid[row][col] === CELL_TYPE.END) {
            setInfoModalTitle("Invalid Start Point");
            setInfoMessage('Cannot set start on a wall or end node.');
            setShowInfoModal(true);
            return prevGrid;
        }

        newGrid[row][col] = CELL_TYPE.START;
        setStartNode({ row, col });
        setMessage('Start point set. Now set the end point or draw walls.');
        return newGrid;
        });
        setAiPath([]);
        setAiVisited([]);
        setAiEdges([]);
        setRobotPosition(null);
        if (robotAnimationTimeoutRef.current) {
        clearTimeout(robotAnimationTimeoutRef.current);
        }
    }, [startNode]);

    // Set the end node
    const setEnd = useCallback((row, col) => {
        setGrid(prevGrid => {
        const newGrid = prevGrid.map(arr => [...arr]);

        if (endNode) {
            newGrid[endNode.row][endNode.col] = CELL_TYPE.EMPTY;
        }

        if (newGrid[row][col] === CELL_TYPE.WALL || newGrid[row][col] === CELL_TYPE.START) {
            setInfoModalTitle("Invalid End Point");
            setInfoMessage('Cannot set end on a wall or start node.');
            setShowInfoModal(true);
            return prevGrid;
        }

        newGrid[row][col] = CELL_TYPE.END;
        setEndNode({ row, col });
        setMessage('End point set. Click "Find Path" to see the AI navigate.');
        return newGrid;
        });
        setAiPath([]);
        setAiVisited([]);
        setAiEdges([]);
        setRobotPosition(null);
        if (robotAnimationTimeoutRef.current) {
        clearTimeout(robotAnimationTimeoutRef.current);
        }
    }, [endNode]);

    // --- Firestore Maze Storage Handlers ---
    const loadMazesFromFirestore = useCallback(async () => {
        if (!dbRef.current || !user) {
        setAvailableMazes([]);
        return;
        }
        try {
        setMessage('Loading available mazes...');
        const mazesCollectionRef = getPublicMazesCollectionRef();
        const q = query(mazesCollectionRef);
        const querySnapshot = await getDocs(q);
        const loaded = [];
        querySnapshot.forEach((doc) => {
            loaded.push({ id: doc.id, ...doc.data() });
        });
        setAvailableMazes(loaded);
        setMessage('Mazes loaded.');
        } catch (error) {
        setInfoModalTitle("Load Mazes Error");
        setInfoMessage(`Failed to load mazes: ${error.message}`);
        setShowInfoModal(true);
        console.error("Error loading mazes:", error);
        }
    }, [user, getPublicMazesCollectionRef]); // Added getPublicMazesCollectionRef to dependencies

    // --- Leaderboard and Maze Stats Updates ---
    const loadLeaderboardEntries = useCallback(async () => {
        if (!dbRef.current) return;
        try {
        const leaderboardCollectionRef = getLeaderboardCollectionRef();
        // Fetch top 10 entries, ordered by solve time (ascending)
        const q = query(leaderboardCollectionRef, orderBy('solveTimeMs'), limit(10));
        const querySnapshot = await getDocs(q);
        const entries = [];
        querySnapshot.forEach(doc => entries.push({ id: doc.id, ...doc.data() }));
        setLeaderboardEntries(entries);
        } catch (error) {
        console.error("Error loading leaderboard entries:", error);
        setInfoModalTitle("Leaderboard Error");
        setInfoMessage(`Failed to load leaderboard: ${error.message}`);
        setShowInfoModal(true);
        }
    }, [getLeaderboardCollectionRef]); // Added getLeaderboardCollectionRef to dependencies

    // Animate the robot moving along the found path
    const animateRobotPath = useCallback((path) => {
        let i = 0;
        setRobotPosition(path[0]);

        const moveRobot = () => {
        if (i < path.length) {
            setRobotPosition(path[i]);
            i++;
            robotAnimationTimeoutRef.current = setTimeout(moveRobot, 100);
        } else {
            setMessage('Robot reached the destination!');
        }
        };
        robotAnimationTimeoutRef.current = setTimeout(moveRobot, 500);
    }, []);

    // --- Record Leaderboard Entry and Update Maze Stats ---
    const recordLeaderboardEntry = useCallback(async (mazeId, userId, userDisplayName, solveTimeMs, blocksCovered) => {
        if (!dbRef.current) return;
        try {
        const leaderboardCollectionRef = getLeaderboardCollectionRef();
        await addDoc(leaderboardCollectionRef, {
            mazeId,
            userId,
            userDisplayName,
            solveTimeMs,
            blocksCovered,
            algorithm: selectedAlgorithm,
            solvedAt: new Date(),
        });
        setMessage('Performance recorded on leaderboard!');
        await loadLeaderboardEntries(); // Refresh leaderboard
        } catch (error) {
        console.error("Error recording leaderboard entry:", error);
        }
    }, [getLeaderboardCollectionRef, loadLeaderboardEntries, selectedAlgorithm]);

    const updateMazeSolveStats = useCallback(async (mazeId, solveTimeMs) => {
        if (!dbRef.current || !user || !userProfile) return;
        try {
        const mazeDocRef = doc(getPublicMazesCollectionRef(), mazeId);
        const mazeSnap = await getDoc(mazeDocRef);
        if (mazeSnap.exists()) {
            const currentMazeData = mazeSnap.data();
            const currentSolveCount = currentMazeData.solveCount || 0;
            const currentAverageSolveTime = currentMazeData.averageSolveTime || 0;

            const newSolveCount = currentSolveCount + 1;
            const newAverageSolveTime =
            (currentAverageSolveTime * currentSolveCount + solveTimeMs) / newSolveCount;

            await updateDoc(mazeDocRef, {
            solveCount: newSolveCount,
            averageSolveTime: newAverageSolveTime,
            lastUpdated: new Date(),
            });

            // Update user's totalMazesSolved count
            const userProfileRef = getUserProfileDocRef(user.uid);
            await updateDoc(userProfileRef, {
            totalMazesSolved: (userProfile.totalMazesSolved || 0) + 1,
            lastLogin: new Date(),
            });
            setUserProfile(prev => ({ ...prev, totalMazesSolved: (prev.totalMazesSolved || 0) + 1 }));

        }
        } catch (error) {
        console.error("Error updating maze solve stats:", error);
        }
    }, [user, userProfile, getPublicMazesCollectionRef, getUserProfileDocRef]);


    useEffect(() => {
        try {
        // --- START OF LOCAL FIREBASE CONFIGURATION ---
        // IMPORTANT: For local development, uncomment the 'firebaseConfig' and 'appId' lines below
        // and replace the placeholder values with your actual Firebase project configuration.
        // You can find this in your Firebase Console -> Project settings -> Your apps -> Web app.

        // Global variables are provided by the Canvas environment
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
            // Replace these with your actual Firebase project configuration
            apiKey: "AIzaSyDqZ-zD0nz3X_xJ9VE5UlBQn0jSCf6ksIU", // <--- YOUR API KEY HERE
            authDomain: "maze-navigator-8dd77.firebaseapp.com",
            projectId: "maze-navigator-8dd77",
            storageBucket: "maze-navigator-8dd77.firebasestorage.app",
            messagingSenderId: "834878328497",
            appId: "1:834878328497:web:07563bd99bfb85e3fd1c90"
        };
        const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId; // Use appId from global or your config

        // --- END OF LOCAL FIREBASE CONFIGURATION ---


        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const auth = getAuth(app);
        dbRef.current = db;
        authRef.current = auth;
        appIdRef.current = appId; // Set appIdRef here

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
            setUser(currentUser);
            setUserId(currentUser.uid);
            setIsAuthReady(true);
            setMessage('Welcome! Draw your maze or load an existing one.');
            // Load mazes and user profile once authenticated
            if (dbRef.current) {
                // Ensure these are called after dbRef.current is set and auth is ready
                await fetchOrCreateUserProfile(currentUser.uid, currentUser.email);
                await loadMazesFromFirestore();
                await loadLeaderboardEntries();
            }
            } else {
            // Attempt anonymous sign-in if no user and no initial token
            if (typeof __initial_auth_token === 'undefined') {
                await signInAnonymously(auth);
            } else {
                // Use custom token if provided (for Canvas environment)
                try {
                await signInWithCustomToken(auth, __initial_auth_token);
                } catch (error) {
                console.error("Error signing in with custom token:", error);
                setAuthMessage(`Authentication error: ${error.message}`);
                setIsAuthReady(true); // Still set ready even if token fails, to allow manual login
                }
            }
            setUser(null);
            setUserId('Not logged in');
            setUserProfile(null); // Clear profile on sign out/no user
            setIsAuthReady(true);
            setMessage('Please sign in or sign up to save and load mazes.');
            }
        });

        return () => {
            unsubscribe();
            // Clear any timeouts on unmount
            if (pathfindingTimeoutRef.current) clearTimeout(pathfindingTimeoutRef.current);
            if (robotAnimationTimeoutRef.current) clearTimeout(robotAnimationTimeoutRef.current);
        };
        } catch (error) {
        console.error("Firebase initialization error:", error);
        setInfoModalTitle("Initialization Error");
        setInfoMessage(`Failed to initialize Firebase: ${error.message}. Please check your environment configuration.`);
        setShowInfoModal(true);
        setIsAuthReady(true); // Allow UI to render even with init error
        }
    }, [fetchOrCreateUserProfile, loadMazesFromFirestore, loadLeaderboardEntries]); // Dependencies for useEffect

    // Function to initialize or reset the grid
    const initializeGrid = useCallback(() => {
        const newGrid = Array(GRID_SIZE)
        .fill(0)
        .map(() => Array(GRID_SIZE).fill(CELL_TYPE.EMPTY));
        setGrid(newGrid);
        setStartNode(null);
        setEndNode(null);
        setAiPath([]);
        setAiVisited([]);
        setAiEdges([]);
        setRobotPosition(null);
        setIsDrawing(false); // Reset drawing state
        setMode('drawWall'); // Default back to draw walls mode
        setStartDrawingCell(null); // Clear start drawing cell
        setCurrentHoveredCell(null); // Clear hovered cell
        setTimeTaken(null); // Reset stats
        setBlocksCovered(null); // Reset stats
        setSelectedMazeId(null); // Clear selected maze ID
        setNodeInfo(new Map()); // Reset node information
        setSelectedNode(null); // Clear selected node
        setMessage('Click and drag to draw walls. Use buttons below to change mode.');
        if (pathfindingTimeoutRef.current) {
        clearTimeout(pathfindingTimeoutRef.current);
        }
        if (robotAnimationTimeoutRef.current) {
        clearTimeout(robotAnimationTimeoutRef.current);
        }
        setIsPathfinding(false);
    }, []);

    // Handle mouse down event on a cell for drawing or setting points
    const handleMouseDown = useCallback((row, col) => {
        if (isPathfinding) return;
        // Clear any previous path/robot when starting a new action
        setAiPath([]);
        setAiVisited([]);
        setAiEdges([]);
        setRobotPosition(null);
        if (robotAnimationTimeoutRef.current) clearTimeout(robotAnimationTimeoutRef.current);
        setTimeTaken(null); // Reset stats
        setBlocksCovered(null); // Reset stats

        if (mode === 'drawWall') {
        setIsDrawing(true);
        setStartDrawingCell({ row, col }); // Store the starting point
        setMessage('Drag to draw a line of walls, then release.');
        } else if (mode === 'setStart') {
        setStart(row, col);
        } else if (mode === 'setEnd') {
        setEnd(row, col);
        } else if (mode === 'eraseWall') { // New erase wall logic
        eraseWall(row, col);
        }
    }, [mode, isPathfinding, eraseWall, setStart, setEnd]);

    // Handle mouse enter event on a cell for drawing (while mouse is down)
    const handleMouseEnter = useCallback((row, col) => {
        setCurrentHoveredCell({ row, col }); // Always update hovered cell
        // In line drawing mode, we don't draw walls on mouse enter.
        // The actual wall drawing happens on mouseUp.
        // If we wanted visual feedback (preview line), it would go here.
    }, []);


    // Handle mouse up event (anywhere on the document) to stop drawing
    const handleMouseUp = useCallback(() => {
        // Only proceed if we were in drawing mode and have valid start/end points for a line
        if (isDrawing && mode === 'drawWall' && startDrawingCell && currentHoveredCell) {
        // Check if the start and end cells are different to ensure a drag occurred
        if (startDrawingCell.row !== currentHoveredCell.row || startDrawingCell.col !== currentHoveredCell.col) {
            const cellsToDraw = getCellsInLine(startDrawingCell, currentHoveredCell);
            setGrid(prevGrid => {
            const newGrid = prevGrid.map(arr => [...arr]);
            cellsToDraw.forEach(cell => {
                // Only draw wall if it's not a start or end node
                if (newGrid[cell.row][cell.col] !== CELL_TYPE.START && newGrid[cell.row][cell.col] !== CELL_TYPE.END) {
                newGrid[cell.row][cell.col] = CELL_TYPE.WALL;
                }
            });
            return newGrid;
            });
            setMessage('Wall line drawn. Click "Draw Walls" to draw another line.');
            setMode(null); // Disable drawing mode only after a line is drawn
        } else {
            // If start and end cells are the same, it was just a click, not a drag to draw a line.
            // Keep the mode as 'drawWall'
            setMessage('Click and drag to draw a line of walls, then release.');
        }
        } else if (mode === 'drawWall') {
            // If isDrawing was false, but mode is drawWall, it means they clicked and released without dragging.
            // Keep the mode as 'drawWall'
            setMessage('Click and drag to draw a line of walls, then release.');
        }

        // Always stop the internal drawing flag
        setIsDrawing(false);
        setStartDrawingCell(null); // Clear start point
        setCurrentHoveredCell(null); // Clear hovered point
    }, [isDrawing, mode, startDrawingCell, currentHoveredCell]);

    // Attach and detach mouseup listener
    useEffect(() => {
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
        document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseUp]);

    // --- Authentication Handlers ---
    const handleSignUp = async () => {
        if (!authRef.current) return;
        try {
        setAuthMessage('Signing up...');
        const userCredential = await createUserWithEmailAndPassword(authRef.current, email, password);
        // Create initial user profile
        await setDoc(getUserProfileDocRef(userCredential.user.uid), {
            displayName: userCredential.user.email.split('@')[0], // Default display name
            createdAt: new Date(),
            lastLogin: new Date(),
            totalMazesCreated: 0,
            totalMazesSolved: 0,
        });
        setAuthMessage('Sign up successful! You are now logged in.');
        setEmail('');
        setPassword('');
        } catch (error) {
        setAuthMessage(`Sign up failed: ${error.message}. Please ensure Email/Password authentication is enabled in your Firebase project.`);
        console.error("Sign up error:", error);
        }
    };

    const handleSignIn = async () => {
        if (!authRef.current) return;
        try {
        setAuthMessage('Signing in...');
        await signInWithEmailAndPassword(authRef.current, email, password);
        setAuthMessage('Sign in successful!');
        setEmail('');
        setPassword('');
        } catch (error) {
        setAuthMessage(`Sign in failed: ${error.message}. Please ensure Email/Password authentication is enabled in your Firebase project.`);
        console.error("Sign in error:", error);
        }
    };

    const handleSignOut = async () => {
        if (!authRef.current) return;
        try {
        await signOut(authRef.current);
        setMessage('You have been signed out.');
        initializeGrid(); // Clear maze on sign out
        } catch (error) {
        setInfoModalTitle("Sign Out Error");
        setInfoMessage(`Failed to sign out: ${error.message}`);
        setShowInfoModal(true);
        console.error("Sign out error:", error);
        }
    };

    // --- User Profile Management ---
    const updateDisplayName = async () => {
        if (!user || !dbRef.current || !displayName.trim()) {
        setInfoModalTitle("Profile Update Error");
        setInfoMessage('Please sign in and enter a valid display name.');
        setShowInfoModal(true);
        return;
        }
        const profileRef = getUserProfileDocRef(user.uid);
        try {
        await updateDoc(profileRef, { displayName: displayName.trim() });
        setUserProfile(prev => ({ ...prev, displayName: displayName.trim() }));
        setMessage('Display name updated successfully!');
        } catch (error) {
        setInfoModalTitle("Profile Update Error");
        setInfoMessage(`Failed to update display name: ${error.message}`);
        setShowInfoModal(true);
        console.error("Error updating display name:", error);
        }
    };

    // --- Firestore Maze Storage Handlers ---
    const saveMaze = async () => {
        if (!dbRef.current || !user || !userProfile) {
        setInfoModalTitle("Authentication Required");
        setInfoMessage('Please sign in and ensure your profile is loaded to save mazes.');
        setShowInfoModal(true);
        return;
        }
        if (!mazeNameToSave.trim()) {
        setInfoModalTitle("Missing Maze Name");
        setInfoMessage('Please enter a name for your maze.');
        setShowInfoModal(true);
        return;
        }
        if (!startNode || !endNode) {
        setInfoModalTitle("Incomplete Maze");
        setInfoMessage('Please set both start (A) and end (B) points before saving.');
        setShowInfoModal(true);
        return;
        }

        try {
        setMessage('Saving maze...');
        const mazeData = {
            name: mazeNameToSave,
            grid: JSON.stringify(grid), // Convert 2D array to JSON string
            startNode: startNode,
            endNode: endNode,
            creatorId: user.uid,
            creatorDisplayName: userProfile.displayName || user.email, // Use display name from profile
            createdAt: new Date(),
            lastUpdated: new Date(),
            difficulty: "Medium", // Placeholder, could be dynamic
            playCount: 0,
            solveCount: 0,
            averageSolveTime: 0,
        };

        const mazesCollectionRef = getPublicMazesCollectionRef();
        await addDoc(mazesCollectionRef, mazeData);

        // Update user's totalMazesCreated count
        const userProfileRef = getUserProfileDocRef(user.uid);
        await updateDoc(userProfileRef, {
            totalMazesCreated: (userProfile.totalMazesCreated || 0) + 1,
            lastLogin: new Date(), // Update last login on activity
        });
        setUserProfile(prev => ({ ...prev, totalMazesCreated: (prev.totalMazesCreated || 0) + 1 }));


        setMessage(`Maze "${mazeNameToSave}" saved successfully!`);
        setMazeNameToSave(''); // Clear input
        await loadMazesFromFirestore(); // Reload available mazes
        } catch (error) {
        setInfoModalTitle("Save Maze Error");
        setInfoMessage(`Failed to save maze: ${error.message}`);
        setShowInfoModal(true);
        console.error("Error saving maze:", error);
        }
    };


    const loadSelectedMaze = async (maze) => {
        try {
        // Parse the grid JSON string back to a 2D array
        const loadedGrid = JSON.parse(maze.grid);
        initializeGrid(); // Clear current maze before loading new one
        setGrid(loadedGrid);
        setStartNode(maze.startNode);
        setEndNode(maze.endNode);
        setSelectedMazeId(maze.id); // Set the ID of the loaded maze
        setMessage(`Maze "${maze.name}" loaded.`);
        setShowLoadMazeModal(false); // Close modal

        // Increment playCount for the loaded maze
        const mazeDocRef = doc(getPublicMazesCollectionRef(), maze.id);
        await updateDoc(mazeDocRef, {
            playCount: (maze.playCount || 0) + 1,
            lastUpdated: new Date(),
        });
        // No need to update local availableMazes immediately, will refresh on next load
        } catch (error) {
        setInfoModalTitle("Load Maze Error");
        setInfoMessage(`Failed to load selected maze: ${error.name}: ${error.message}. The maze data might be corrupted.`);
        setShowInfoModal(true);
        console.error("Error loading selected maze:", error);
        }
    };

    // --- Depth-First Search (DFS) algorithm for pathfinding ---
    const findPathDFS = useCallback(async () => { // Made async to await Firestore updates
        if (!startNode || !endNode) {
        setInfoModalTitle("Missing Points");
        setInfoMessage('Please set both start (A) and end (B) points.');
        setShowInfoModal(true);
        return;
        }

        setIsPathfinding(true);
        setAiPath([]);
        setAiVisited([]);
        setRobotPosition(null);
        setTimeTaken(null); // Reset stats at the beginning of pathfinding
        setBlocksCovered(null); // Reset stats
        setNodeInfo(new Map()); // Reset node information

        const startTime = Date.now(); // Record start time

        const stack = [];
        const visited = new Set();
        const parentMap = new Map();
        const nodeInfoMap = new Map();

        stack.push(startNode);
        visited.add(`${startNode.row},${startNode.col}`);
        
        // Mark start node as root
        const startKey = `${startNode.row},${startNode.col}`;
        nodeInfoMap.set(startKey, {
            type: 'root',
            order: 1,
            parent: null,
            children: []
        });

        const visitedNodesForAnimation = [];
        const edges = [];
        let nodeOrder = 2;

        const animateSearch = (s, v, pMap, nMap) => {
        if (s.length === 0) {
            const endTime = Date.now();
            setTimeTaken(endTime - startTime); // Calculate time taken
            setBlocksCovered(visitedNodesForAnimation.length); // Set blocks covered
            setNodeInfo(nMap); // Set final node information
            setMessage('No path found!');
            setIsPathfinding(false);
            setInfoModalTitle("Path Not Found");
            setInfoMessage('The AI could not find a path to the destination. Try adjusting the maze or start/end points.');
            setShowInfoModal(true);
            return;
        }

        const currentNode = s.pop();
        const { row, col } = currentNode;
        const currentKey = `${row},${col}`;

        if (row === endNode.row && col === endNode.col) {
            const endTime = Date.now(); // Corrected from Date.Now()
            const finalTimeTaken = endTime - startTime;
            const finalBlocksCovered = visitedNodesForAnimation.length;

            setTimeTaken(finalTimeTaken); // Calculate time taken
            setBlocksCovered(finalBlocksCovered); // Set blocks covered
            setNodeInfo(nMap); // Set final node information
            const path = reconstructPath(pMap, currentNode);
            setAiPath(path);
            setAiVisited(visitedNodesForAnimation);
            setMessage('Path found! Robot navigating...');
            setIsPathfinding(false);
            animateRobotPath(path);

            // Record solve to leaderboard and update maze stats
            if (user && selectedMazeId) {
            recordLeaderboardEntry(selectedMazeId, user.uid, userProfile?.displayName || user.email, finalTimeTaken, finalBlocksCovered);
            updateMazeSolveStats(selectedMazeId, finalTimeTaken);
            }
            return;
        }

        if (grid[row][col] !== CELL_TYPE.START && grid[row][col] !== CELL_TYPE.END) {
            visitedNodesForAnimation.push(currentNode);
            setAiVisited([...visitedNodesForAnimation]);
        }

        const directions = [
            { dr: -1, dc: 0 }, // Up
            { dr: 1, dc: 0 },  // Down
            { dr: 0, dc: -1 }, // Left
            { dr: 0, dc: 1 },  // Right
        ];

        let hasChildren = false;
        for (let i = directions.length - 1; i >= 0; i--) {
            const dir = directions[i];
            const newRow = row + dir.dr;
            const newCol = col + dir.dc;

            if (newRow < 0 || newRow >= GRID_SIZE || newCol < 0 || newCol >= GRID_SIZE) {
            continue;
            }

            const cellType = grid[newRow][newCol];
            const neighborKey = `${newRow},${newCol}`;

            if (cellType !== CELL_TYPE.WALL && !v.has(neighborKey)) {
            v.add(neighborKey);
            s.push({ row: newRow, col: newCol });
            pMap.set(neighborKey, currentNode);
            edges.push({ from: { row, col }, to: { row: newRow, col: newCol } });
            
            // Add child node information
            nMap.set(neighborKey, {
                type: 'child',
                order: nodeOrder++,
                parent: { row, col },
                children: []
            });
            
            // Update parent's children list
            if (nMap.has(currentKey)) {
                nMap.get(currentKey).children.push({ row: newRow, col: newCol });
            }
            
            hasChildren = true;
            }
        }

        // Update current node type if it has children
        if (nMap.has(currentKey) && hasChildren) {
            nMap.get(currentKey).type = 'parent';
        } else if (nMap.has(currentKey) && !hasChildren) {
            nMap.get(currentKey).type = 'leaf';
        }

        setAiEdges([...edges]);
        pathfindingTimeoutRef.current = setTimeout(() => animateSearch(s, v, pMap, nMap), 20);
        };

        const reconstructPath = (pMap, targetNode) => {
        let current = targetNode;
        const path = [];
        while (current) {
            path.unshift(current);
            const parent = pMap.get(`${current.row},${current.col}`);
            current = parent;
        }
        return path;
        };

        setAiEdges([]);
        animateSearch(stack, visited, parentMap, nodeInfoMap);
    }, [grid, startNode, endNode, user, selectedMazeId, userProfile, recordLeaderboardEntry, updateMazeSolveStats, animateRobotPath]);

    // --- Breadth-First Search (BFS) for shortest path on unweighted grids ---
    const findPathBFS = useCallback(async () => {
        if (!startNode || !endNode) {
        setInfoModalTitle("Missing Points");
        setInfoMessage('Please set both start (A) and end (B) points.');
        setShowInfoModal(true);
        return;
        }

        setIsPathfinding(true);
        setAiPath([]);
        setAiVisited([]);
        setRobotPosition(null);
        setTimeTaken(null);
        setBlocksCovered(null);
        setNodeInfo(new Map()); // Reset node information

        const startTime = Date.now();

        const queue = [];
        let queueIndex = 0;
        const visited = new Set();
        const parentMap = new Map();
        const nodeInfoMap = new Map();
        const visitedNodesForAnimation = [];
        const edges = [];

        const startKey = `${startNode.row},${startNode.col}`;
        queue.push(startNode);
        visited.add(startKey);
        
        // Mark start node as root
        nodeInfoMap.set(startKey, {
            type: 'root',
            order: 1,
            parent: null,
            children: []
        });
        
        let nodeOrder = 2;

        const reconstructPath = (pMap, targetNode) => {
        let current = targetNode;
        const path = [];
        while (current) {
            path.unshift(current);
            const parent = pMap.get(`${current.row},${current.col}`);
            current = parent;
        }
        return path;
        };

        const step = () => {
        if (queueIndex >= queue.length) {
            const endTime = Date.now();
            setTimeTaken(endTime - startTime);
            setBlocksCovered(visitedNodesForAnimation.length);
            setNodeInfo(nodeInfoMap); // Set final node information
            setMessage('No path found!');
            setIsPathfinding(false);
            setInfoModalTitle("Path Not Found");
            setInfoMessage('The AI could not find a path to the destination. Try adjusting the maze or start/end points.');
            setShowInfoModal(true);
            return;
        }

        const currentNode = queue[queueIndex++];
        const { row, col } = currentNode;
        const currentKey = `${row},${col}`;

        if (row === endNode.row && col === endNode.col) {
            const endTime = Date.now();
            const finalTimeTaken = endTime - startTime;
            const finalBlocksCovered = visitedNodesForAnimation.length;
            setTimeTaken(finalTimeTaken);
            setBlocksCovered(finalBlocksCovered);
            setNodeInfo(nodeInfoMap); // Set final node information
            const path = reconstructPath(parentMap, currentNode);
            setAiPath(path);
            setAiVisited(visitedNodesForAnimation);
            setMessage('Path found! Robot navigating...');
            setIsPathfinding(false);
            animateRobotPath(path);
            if (user && selectedMazeId) {
            recordLeaderboardEntry(selectedMazeId, user.uid, userProfile?.displayName || user.email, finalTimeTaken, finalBlocksCovered);
            updateMazeSolveStats(selectedMazeId, finalTimeTaken);
            }
            return;
        }

        if (grid[row][col] !== CELL_TYPE.START && grid[row][col] !== CELL_TYPE.END) {
            visitedNodesForAnimation.push(currentNode);
            setAiVisited([...visitedNodesForAnimation]);
        }

        const directions = [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
        ];

        let hasChildren = false;
        for (let i = 0; i < directions.length; i++) {
            const dir = directions[i];
            const newRow = row + dir.dr;
            const newCol = col + dir.dc;
            if (newRow < 0 || newRow >= GRID_SIZE || newCol < 0 || newCol >= GRID_SIZE) continue;
            const cellType = grid[newRow][newCol];
            const neighborKey = `${newRow},${newCol}`;
            if (cellType !== CELL_TYPE.WALL && !visited.has(neighborKey)) {
            visited.add(neighborKey);
            queue.push({ row: newRow, col: newCol });
            parentMap.set(neighborKey, currentNode);
            edges.push({ from: { row, col }, to: { row: newRow, col: newCol } });
            
            // Add child node information
            nodeInfoMap.set(neighborKey, {
                type: 'child',
                order: nodeOrder++,
                parent: { row, col },
                children: []
            });
            
            // Update parent's children list
            if (nodeInfoMap.has(currentKey)) {
                nodeInfoMap.get(currentKey).children.push({ row: newRow, col: newCol });
            }
            
            hasChildren = true;
            }
        }

        // Update current node type if it has children
        if (nodeInfoMap.has(currentKey) && hasChildren) {
            nodeInfoMap.get(currentKey).type = 'parent';
        } else if (nodeInfoMap.has(currentKey) && !hasChildren) {
            nodeInfoMap.get(currentKey).type = 'leaf';
        }

        setAiEdges([...edges]);
        pathfindingTimeoutRef.current = setTimeout(step, 20);
        };

        setAiEdges([]);
        step();
    }, [grid, startNode, endNode, user, selectedMazeId, userProfile, recordLeaderboardEntry, updateMazeSolveStats, animateRobotPath]);

    // --- Dijkstra's Algorithm (equivalent to BFS on uniform-cost grid) ---
    const findPathDijkstra = useCallback(async () => {
        if (!startNode || !endNode) {
        setInfoModalTitle("Missing Points");
        setInfoMessage('Please set both start (A) and end (B) points.');
        setShowInfoModal(true);
        return;
        }

        setIsPathfinding(true);
        setAiPath([]);
        setAiVisited([]);
        setRobotPosition(null);
        setTimeTaken(null);
        setBlocksCovered(null);

        const startTime = Date.now();

        const openList = [];
        const gScore = new Map();
        const parentMap = new Map();
        const closed = new Set();
        const visitedNodesForAnimation = [];
        const edges = [];

        const startKey = `${startNode.row},${startNode.col}`;
        openList.push({ row: startNode.row, col: startNode.col, g: 0 });
        gScore.set(startKey, 0);

        const reconstructPath = (pMap, targetNode) => {
        let current = targetNode;
        const path = [];
        while (current) {
            path.unshift({ row: current.row, col: current.col });
            const parent = pMap.get(`${current.row},${current.col}`);
            current = parent ? { row: parent.row, col: parent.col, g: 0 } : null;
        }
        return path;
        };

        const step = () => {
        if (openList.length === 0) {
            const endTime = Date.now();
            setTimeTaken(endTime - startTime);
            setBlocksCovered(visitedNodesForAnimation.length);
            setMessage('No path found!');
            setIsPathfinding(false);
            setInfoModalTitle("Path Not Found");
            setInfoMessage('The AI could not find a path to the destination. Try adjusting the maze or start/end points.');
            setShowInfoModal(true);
            return;
        }

        // Pick node with smallest g (uniform cost)
        let minIndex = 0;
        for (let i = 1; i < openList.length; i++) {
            if (openList[i].g < openList[minIndex].g) minIndex = i;
        }
        const current = openList.splice(minIndex, 1)[0];
        const currentKey = `${current.row},${current.col}`;

        if (current.row === endNode.row && current.col === endNode.col) {
            const endTime = Date.now();
            const finalTimeTaken = endTime - startTime;
            const finalBlocksCovered = visitedNodesForAnimation.length;
            setTimeTaken(finalTimeTaken);
            setBlocksCovered(finalBlocksCovered);
            const path = reconstructPath(parentMap, current);
            setAiPath(path);
            setAiVisited(visitedNodesForAnimation);
            setMessage('Path found! Robot navigating...');
            setIsPathfinding(false);
            animateRobotPath(path);
            if (user && selectedMazeId) {
            recordLeaderboardEntry(selectedMazeId, user.uid, userProfile?.displayName || user.email, finalTimeTaken, finalBlocksCovered);
            updateMazeSolveStats(selectedMazeId, finalTimeTaken);
            }
            return;
        }

        if (!closed.has(currentKey) && grid[current.row][current.col] !== CELL_TYPE.START && grid[current.row][current.col] !== CELL_TYPE.END) {
            visitedNodesForAnimation.push({ row: current.row, col: current.col });
            setAiVisited([...visitedNodesForAnimation]);
        }
        closed.add(currentKey);

        const directions = [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
        ];

        for (let i = 0; i < directions.length; i++) {
            const dir = directions[i];
            const newRow = current.row + dir.dr;
            const newCol = current.col + dir.dc;
            if (newRow < 0 || newRow >= GRID_SIZE || newCol < 0 || newCol >= GRID_SIZE) continue;
            const cellType = grid[newRow][newCol];
            const neighborKey = `${newRow},${newCol}`;
            if (cellType === CELL_TYPE.WALL || closed.has(neighborKey)) continue;

            const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
            const neighborG = gScore.get(neighborKey);
            if (neighborG === undefined || tentativeG < neighborG) {
            parentMap.set(neighborKey, { row: current.row, col: current.col });
            gScore.set(neighborKey, tentativeG);

            const existingIndex = openList.findIndex(n => n.row === newRow && n.col === newCol);
            if (existingIndex === -1) {
                openList.push({ row: newRow, col: newCol, g: tentativeG });
            } else {
                openList[existingIndex].g = tentativeG;
            }
            edges.push({ from: { row: current.row, col: current.col }, to: { row: newRow, col: newCol } });
            }
        }

        setAiEdges([...edges]);
        pathfindingTimeoutRef.current = setTimeout(step, 20);
        };

        setAiEdges([]);
        step();
    }, [grid, startNode, endNode, user, selectedMazeId, userProfile, recordLeaderboardEntry, updateMazeSolveStats, animateRobotPath]);

    // --- A* Search (with Manhattan distance heuristic) ---
    const findPathAStar = useCallback(async () => {
        if (!startNode || !endNode) {
        setInfoModalTitle("Missing Points");
        setInfoMessage('Please set both start (A) and end (B) points.');
        setShowInfoModal(true);
        return;
        }

        setIsPathfinding(true);
        setAiPath([]);
        setAiVisited([]);
        setRobotPosition(null);
        setTimeTaken(null);
        setBlocksCovered(null);

        const startTime = Date.now();

        const heuristic = (r, c) => Math.abs(r - endNode.row) + Math.abs(c - endNode.col);

        const openList = [];
        const gScore = new Map();
        const fScore = new Map();
        const parentMap = new Map();
        const closed = new Set();
        const visitedNodesForAnimation = [];
        const edges = [];

        const startKey = `${startNode.row},${startNode.col}`;
        gScore.set(startKey, 0);
        fScore.set(startKey, heuristic(startNode.row, startNode.col));
        openList.push({ row: startNode.row, col: startNode.col, g: 0, f: fScore.get(startKey) });

        const reconstructPath = (pMap, targetNode) => {
        let current = targetNode;
        const path = [];
        while (current) {
            path.unshift({ row: current.row, col: current.col });
            const parent = pMap.get(`${current.row},${current.col}`);
            current = parent ? { row: parent.row, col: parent.col, g: 0, f: 0 } : null;
        }
        return path;
        };

        const step = () => {
        if (openList.length === 0) {
            const endTime = Date.now();
            setTimeTaken(endTime - startTime);
            setBlocksCovered(visitedNodesForAnimation.length);
            setMessage('No path found!');
            setIsPathfinding(false);
            setInfoModalTitle("Path Not Found");
            setInfoMessage('The AI could not find a path to the destination. Try adjusting the maze or start/end points.');
            setShowInfoModal(true);
            return;
        }

        // Pick node with smallest f
        let minIndex = 0;
        for (let i = 1; i < openList.length; i++) {
            if (openList[i].f < openList[minIndex].f) minIndex = i;
        }
        const current = openList.splice(minIndex, 1)[0];
        const currentKey = `${current.row},${current.col}`;

        if (current.row === endNode.row && current.col === endNode.col) {
            const endTime = Date.now();
            const finalTimeTaken = endTime - startTime;
            const finalBlocksCovered = visitedNodesForAnimation.length;
            setTimeTaken(finalTimeTaken);
            setBlocksCovered(finalBlocksCovered);
            const path = reconstructPath(parentMap, current);
            setAiPath(path);
            setAiVisited(visitedNodesForAnimation);
            setMessage('Path found! Robot navigating...');
            setIsPathfinding(false);
            animateRobotPath(path);
            if (user && selectedMazeId) {
            recordLeaderboardEntry(selectedMazeId, user.uid, userProfile?.displayName || user.email, finalTimeTaken, finalBlocksCovered);
            updateMazeSolveStats(selectedMazeId, finalTimeTaken);
            }
            return;
        }

        if (!closed.has(currentKey) && grid[current.row][current.col] !== CELL_TYPE.START && grid[current.row][current.col] !== CELL_TYPE.END) {
            visitedNodesForAnimation.push({ row: current.row, col: current.col });
            setAiVisited([...visitedNodesForAnimation]);
        }
        closed.add(currentKey);

        const directions = [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
        ];

        for (let i = 0; i < directions.length; i++) {
            const dir = directions[i];
            const newRow = current.row + dir.dr;
            const newCol = current.col + dir.dc;
            if (newRow < 0 || newRow >= GRID_SIZE || newCol < 0 || newCol >= GRID_SIZE) continue;
            const cellType = grid[newRow][newCol];
            const neighborKey = `${newRow},${newCol}`;
            if (cellType === CELL_TYPE.WALL || closed.has(neighborKey)) continue;

            const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
            const neighborG = gScore.get(neighborKey);
            if (neighborG === undefined || tentativeG < neighborG) {
            parentMap.set(neighborKey, { row: current.row, col: current.col });
            gScore.set(neighborKey, tentativeG);
            const f = tentativeG + heuristic(newRow, newCol);
            fScore.set(neighborKey, f);

            const existingIndex = openList.findIndex(n => n.row === newRow && n.col === newCol);
            if (existingIndex === -1) {
                openList.push({ row: newRow, col: newCol, g: tentativeG, f });
            } else {
                openList[existingIndex].g = tentativeG;
                openList[existingIndex].f = f;
            }
            edges.push({ from: { row: current.row, col: current.col }, to: { row: newRow, col: newCol } });
            }
        }

        setAiEdges([...edges]);
        pathfindingTimeoutRef.current = setTimeout(step, 20);
        };

        setAiEdges([]);
        step();
    }, [grid, startNode, endNode, user, selectedMazeId, userProfile, recordLeaderboardEntry, updateMazeSolveStats, animateRobotPath]);

    const handleFindPath = useCallback(() => {
        if (selectedAlgorithm === 'DFS') {
        findPathDFS();
        } else if (selectedAlgorithm === 'BFS') {
        findPathBFS();
        } else if (selectedAlgorithm === "Dijkstra") {
        findPathDijkstra();
        } else if (selectedAlgorithm === 'A*') {
        findPathAStar();
        }
    }, [selectedAlgorithm, findPathDFS, findPathBFS, findPathDijkstra, findPathAStar]);

    // --- Maze Ratings (Simple Like Button) ---
    const likeLoadedMaze = async () => {
        if (!user || !selectedMazeId || !dbRef.current) {
        setInfoModalTitle("Action Required");
        setInfoMessage('Please sign in and load a maze to like it.');
        setShowInfoModal(true);
        return;
        }
        try {
        const ratingDocRef = doc(getMazeRatingsCollectionRef(selectedMazeId), user.uid); // Use user.uid as rating doc ID
        await setDoc(ratingDocRef, {
            userId: user.uid,
            rating: 1, // Simple "like" represented as 1
            createdAt: new Date(),
            mazeId: selectedMazeId,
        }, { merge: true }); // Use merge to avoid overwriting existing user rating
        setMessage('You liked this maze!');
        } catch (error) {
        setInfoModalTitle("Like Maze Error");
        setInfoMessage(`Failed to like maze: ${error.message}`);
        setShowInfoModal(true);
        console.error("Error liking maze:", error);
        }
    };


    // Button styles
    const buttonClass = "px-4 py-2 m-2 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";
    const primaryButtonClass = `${buttonClass} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
    const secondaryButtonClass = `${buttonClass} bg-gray-300 text-gray-800 hover:bg-gray-400 focus:ring-gray-400`;
    const activeButtonClass = `${buttonClass} bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500`;
    const destructiveButtonClass = `${buttonClass} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`;
    const algorithmStroke = {
        'DFS': '#7c3aed',
        'BFS': '#10b981',
        'Dijkstra': '#3b82f6',
        'A*': '#f59e0b',
    };

    if (!isAuthReady) {
        return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center font-inter">
            <div className="text-center text-xl text-gray-700">
            Initializing application...
            </div>
        </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-inter">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 text-center">
            Maze Navigator
        </h1>

        {!user ? (
            <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md text-center">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Sign Up / Sign In</h2>
            <input
                type="email"
                placeholder="Email"
                className="w-full p-3 mb-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />
            <input
                type="password"
                placeholder="Password"
                className="w-full p-3 mb-6 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex justify-center space-x-4 mb-4">
                <button onClick={handleSignUp} className={primaryButtonClass}>
                Sign Up
                </button>
                <button onClick={handleSignIn} className={secondaryButtonClass}>
                Sign In
                </button>
            </div>
            {authMessage && <p className="text-sm text-red-500 mt-4">{authMessage}</p>}
            </div>
        ) : (
            <>
            <div className="text-sm text-gray-600 mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-center w-full max-w-xl">
                <span>Logged in as: <span className="font-semibold">{userProfile?.displayName || user.email}</span> (<button onClick={handleSignOut} className="text-blue-600 hover:underline">Sign Out</button>)</span>
                <div className="mt-2 sm:mt-0">
                <input
                    type="text"
                    placeholder="Set Display Name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="p-1 border border-gray-300 rounded-md text-sm w-32 sm:w-auto"
                />
                <button onClick={updateDisplayName} className="ml-2 px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600">
                    Update
                </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-xl mb-6 max-w-full overflow-auto">
                <div className="text-center mb-4 text-lg font-medium text-gray-700">
                {message}
                </div>
                <div
                className="grid bg-white rounded-md overflow-hidden"
                style={{
                    gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                    gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
                    width: 'min(90vw, 600px)',
                    height: 'min(90vw, 600px)',
                    aspectRatio: '1 / 1',
                    position: 'relative'
                }}
                >
                {grid.map((rowArr, rowIndex) =>
                    rowArr.map((cellType, colIndex) => (
                    <Cell
                        key={`${rowIndex}-${colIndex}`}
                        type={cellType}
                        onMouseDown={() => handleMouseDown(rowIndex, colIndex)}
                        onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                        isPath={aiPath.some(node => node.row === rowIndex && node.col === colIndex)}
                        isVisited={aiVisited.some(node => node.row === rowIndex && node.col === colIndex)}
                        isRobot={robotPosition && robotPosition.row === rowIndex && robotPosition.col === colIndex}
                        row={rowIndex}
                        col={colIndex}
                        nodeInfo={nodeInfo}
                        showNodeMarkings={showNodeMarkings}
                        onNodeClick={handleNodeClick}
                    />
                    ))
                )}
                {/* SVG overlay for edges and final path */}
                <svg
                    viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
                    preserveAspectRatio="none"
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                >
                    {aiEdges.map((e, idx) => (
                    <line
                        key={`edge-${idx}`}
                        x1={e.from.col + 0.5}
                        y1={e.from.row + 0.5}
                        x2={e.to.col + 0.5}
                        y2={e.to.row + 0.5}
                        stroke={algorithmStroke[selectedAlgorithm]}
                        strokeWidth={0.06}
                        opacity={0.5}
                    />
                    ))}
                    {aiPath.length > 1 && (
                    <polyline
                        points={aiPath.map(p => `${p.col + 0.5},${p.row + 0.5}`).join(' ')}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={0.12}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    )}
                </svg>
                </div>
            </div>

            {/* Display Stats */}
            {timeTaken !== null && blocksCovered !== null && (
                <div className="bg-white p-4 rounded-xl shadow-xl mt-4 text-center text-gray-700 font-medium">
                <p>Last Pathfinding Run Stats:</p>
                <p>Time Taken: <span className="font-semibold">{timeTaken} ms</span></p>
                <p>Blocks Covered: <span className="font-semibold">{blocksCovered}</span></p>
                </div>
            )}

            {/* Node Details Panel */}
            {selectedNode && (
                <div className="bg-white p-4 rounded-xl shadow-xl mt-4 text-center text-gray-700 font-medium max-w-md">
                <h3 className="text-lg font-bold mb-2">Node Details</h3>
                <p><span className="font-semibold">Position:</span> ({selectedNode.row}, {selectedNode.col})</p>
                <p><span className="font-semibold">Type:</span> {selectedNode.type}</p>
                <p><span className="font-semibold">Order:</span> {selectedNode.order}</p>
                {selectedNode.parent && (
                    <p><span className="font-semibold">Parent:</span> ({selectedNode.parent.row}, {selectedNode.parent.col})</p>
                )}
                {selectedNode.children && selectedNode.children.length > 0 && (
                    <div>
                    <p className="font-semibold">Children:</p>
                    {selectedNode.children.map((child, index) => (
                        <span key={index} className="text-sm">
                        ({child.row}, {child.col}){index < selectedNode.children.length - 1 ? ', ' : ''}
                        </span>
                    ))}
                    </div>
                )}
                <button
                    onClick={() => setSelectedNode(null)}
                    className="mt-2 px-3 py-1 bg-gray-500 text-white rounded-md text-sm hover:bg-gray-600"
                >
                    Close
                </button>
                </div>
            )}

            <div className="flex flex-wrap justify-center mt-4">
                <button
                onClick={() => {
                    setMode('drawWall');
                    setIsDrawing(false); // Ensure drawing is off when setting mode
                    setMessage('Click and drag to draw walls.');
                    setAiPath([]); setAiVisited([]); setRobotPosition(null); if (robotAnimationTimeoutRef.current) clearTimeout(robotAnimationTimeoutRef.current);
                    setTimeTaken(null); // Reset stats
                    setBlocksCovered(null); // Reset stats
                }}
                className={mode === 'drawWall' ? activeButtonClass : secondaryButtonClass}
                disabled={isPathfinding}
                >
                Draw Walls
                </button>
                <button
                onClick={() => {
                    setMode('eraseWall'); // Set mode to eraseWall
                    setIsDrawing(false); // Ensure drawing is off
                    setMessage('Click on a wall to erase it.');
                    setAiPath([]); setAiVisited([]); setRobotPosition(null); if (robotAnimationTimeoutRef.current) clearTimeout(robotAnimationTimeoutRef.current);
                    setTimeTaken(null); // Reset stats
                    setBlocksCovered(null); // Reset stats
                }}
                className={mode === 'eraseWall' ? activeButtonClass : secondaryButtonClass}
                disabled={isPathfinding}
                >
                Erase Walls
                </button>
                <button
                onClick={() => {
                    setMode('setStart');
                    setIsDrawing(false); // Ensure drawing is off when setting mode
                    setMessage('Click a cell to set the start (A) point.');
                    setAiPath([]); setAiVisited([]); setRobotPosition(null); if (robotAnimationTimeoutRef.current) clearTimeout(robotAnimationTimeoutRef.current);
                    setTimeTaken(null); // Reset stats
                    setBlocksCovered(null); // Reset stats
                }}
                className={mode === 'setStart' ? activeButtonClass : secondaryButtonClass}
                disabled={isPathfinding}
                >
                Set Start (A)
                </button>
                <button
                onClick={() => {
                    setMode('setEnd');
                    setIsDrawing(false); // Ensure drawing is off when setting mode
                    setMessage('Click a cell to set the end (B) point.');
                    setAiPath([]); setAiVisited([]); setRobotPosition(null); if (robotAnimationTimeoutRef.current) clearTimeout(robotAnimationTimeoutRef.current);
                    setTimeTaken(null); // Reset stats
                    setBlocksCovered(null); // Reset stats
                }}
                className={mode === 'setEnd' ? activeButtonClass : secondaryButtonClass}
                disabled={isPathfinding}
                >
                Set End (B)
                </button>
                <select
                value={selectedAlgorithm}
                onChange={(e) => setSelectedAlgorithm(e.target.value)}
                className="p-2 m-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isPathfinding}
                >
                <option value="DFS">Depth-First Search (DFS)</option>
                <option value="BFS">Breadth-First Search (BFS)</option>
                <option value="Dijkstra">Dijkstra</option>
                <option value="A*">A*</option>
                </select>
                <button
                onClick={handleFindPath}
                className={primaryButtonClass}
                disabled={isPathfinding || !startNode || !endNode}
                >
                {isPathfinding ? 'Finding Path...' : 'Find Path'}
                </button>
                <button
                onClick={initializeGrid}
                className={secondaryButtonClass}
                disabled={isPathfinding}
                >
                Clear Maze
                </button>
                <button
                onClick={() => setShowNodeMarkings(!showNodeMarkings)}
                className={showNodeMarkings ? activeButtonClass : secondaryButtonClass}
                disabled={isPathfinding}
                >
                {showNodeMarkings ? 'Hide Node Info' : 'Show Node Info'}
                </button>
                <input
                type="text"
                placeholder="Maze Name"
                value={mazeNameToSave}
                onChange={(e) => setMazeNameToSave(e.target.value)}
                className="p-2 m-2 border border-gray-300 rounded-lg w-32 sm:w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isPathfinding}
                />
                <button
                onClick={saveMaze}
                className={primaryButtonClass}
                disabled={isPathfinding || !user}
                >
                Save Maze
                </button>
                <button
                onClick={() => setShowLoadMazeModal(true)}
                className={primaryButtonClass}
                disabled={isPathfinding || !user}
                >
                Load Mazes
                </button>
                {selectedMazeId && ( // Show like button only if a maze is loaded
                <button
                    onClick={likeLoadedMaze}
                    className={`${primaryButtonClass} bg-pink-500 hover:bg-pink-600 focus:ring-pink-400`}
                    disabled={isPathfinding || !user}
                >
                    Like Maze ❤️
                </button>
                )}
            </div>

            <p className="mt-8 text-gray-600 text-sm text-center">
                Note: The AI uses <span className="font-semibold">{selectedAlgorithm}</span> to find a path.
            </p>

            {/* Node Marking Legend */}
            {showNodeMarkings && (
                <div className="bg-white p-4 rounded-xl shadow-xl mt-4 text-center text-gray-700 font-medium max-w-md">
                <h3 className="text-lg font-bold mb-2">Node Marking Legend</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center justify-center">
                        <div className="w-4 h-4 bg-purple-600 rounded mr-2"></div>
                        <span>Root Node</span>
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="w-4 h-4 bg-indigo-500 rounded mr-2"></div>
                        <span>Parent Node</span>
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="w-4 h-4 bg-cyan-500 rounded mr-2"></div>
                        <span>Child Node</span>
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="w-4 h-4 bg-orange-500 rounded mr-2"></div>
                        <span>Leaf Node</span>
                    </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    Numbers show traversal order. Click nodes to see details.
                </p>
                </div>
            )}

            {/* Leaderboard Display */}
            {leaderboardEntries.length > 0 && (
                <div className="bg-white p-6 rounded-xl shadow-xl mt-8 w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-gray-800 text-center">Top Solvers</h2>
                <ul className="divide-y divide-gray-200">
                    {leaderboardEntries.map((entry, index) => (
                    <li key={entry.id} className="py-2 flex justify-between items-center text-gray-700">
                        <span className="font-semibold">{index + 1}. {entry.userDisplayName}</span>
                        <span>{entry.solveTimeMs} ms (<span className="text-sm text-gray-500">{entry.blocksCovered} blocks</span>)</span>
                    </li>
                    ))}
                </ul>
                </div>
            )}
            </>
        )}

        {/* Custom Info Modal */}
        <Modal
            show={showInfoModal}
            title={infoModalTitle}
            message={infoMessage}
            onClose={() => setShowInfoModal(false)}
        />

        {/* Load Maze Modal */}
        <Modal
            show={showLoadMazeModal}
            title="Load a Maze"
            onClose={() => setShowLoadMazeModal(false)}
        >
            {availableMazes.length === 0 ? (
            <p className="text-gray-700">No mazes available. Create and save one!</p>
            ) : (
            <ul className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {availableMazes.map((maze) => (
                <li
                    key={maze.id}
                    className="flex justify-between items-center p-3 my-1 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors cursor-pointer"
                >
                    <div>
                    <span className="font-medium text-gray-800">{maze.name}</span>
                    <p className="text-xs text-gray-500">by {maze.creatorDisplayName || 'Unknown'}</p>
                    </div>
                    <button
                    onClick={() => loadSelectedMaze(maze)}
                    className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 transition-colors"
                    >
                    Load
                    </button>
                </li>
                ))}
            </ul>
            )}
        </Modal>
        </div>
    );
    };

    export default App;
