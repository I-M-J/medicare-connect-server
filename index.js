require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const Stripe = require('stripe');

const app = express();
const port = process.env.PORT || 5000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

const uri = process.env.MONGODB_URI;
let client = null;

if (uri && (uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'))) {
    client = new MongoClient(uri);
}
else {
    console.warn('WARNING: MONGODB_URI is not set or invalid. Check your .env file.');
}

// collections
let usersCollection = null;
let doctorsCollection = null;
let appointmentsCollection = null;
let reviewsCollection = null;
let paymentsCollection = null;
let prescriptionsCollection = null;

let dbConnectionPromise = null;

async function connectDB() {
    if (!client) {
        console.warn('Skipping MongoDB connection: client not initialized.');
        return;
    }

    try {
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        console.log('Pinged your deployment. Successfully connected to MongoDB!');

        const db = client.db('medicare_connect_db');
        usersCollection = db.collection('users');
        doctorsCollection = db.collection('doctors');
        appointmentsCollection = db.collection('appointments');
        reviewsCollection = db.collection('reviews');
        paymentsCollection = db.collection('payments');
        prescriptionsCollection = db.collection('prescriptions');

        // seed admin account on startup
        await seedAdmin();
    }
    catch (error) {
        console.error('Database connection error:', error);
        dbConnectionPromise = null;
        throw error;
    }
}

async function seedAdmin() {
    try {
        const existing = await usersCollection.findOne({ email: process.env.ADMIN_EMAIL || 'admin@medicare.com' });
        if (!existing) {
            await usersCollection.insertOne({
                name: 'MediCare Admin',
                email: process.env.ADMIN_EMAIL || 'admin@medicare.com',
                role: 'admin',
                status: 'active',
                createdAt: new Date()
            });
            console.log('Admin account seeded successfully.');
        }
    }
    catch (err) {
        console.error('Admin seeding error:', err.message);
    }
}

dbConnectionPromise = connectDB();

const checkDbConnection = async (req, res, next) => {
    if (!usersCollection) {
        if (dbConnectionPromise) {
            try {
                await dbConnectionPromise;
            }
            catch (err) {
                return res.status(503).send({ message: 'Service Unavailable: Database connection failed.', error: err.message });
            }
        }
        else {
            try {
                dbConnectionPromise = connectDB();
                await dbConnectionPromise;
            }
            catch (err) {
                return res.status(503).send({ message: 'Service Unavailable: Could not connect to database.', error: err.message });
            }
        }
    }
    next();
};

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send({ message: 'Unauthorized access: Missing token' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        const JWKS = createRemoteJWKSet(new URL(`${clientUrl}/api/auth/jwks`));
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
    }
    catch (error) {
        return res.status(403).send({ message: 'Forbidden access: Invalid token', error: error.message });
    }
};

const verifyAdmin = async (req, res, next) => {
    const email = req.user?.email;
    if (!email) return res.status(403).send({ message: 'Forbidden access' });

    try {
        const user = await usersCollection.findOne({ email });
        if (!user || user.role !== 'admin') {
            return res.status(403).send({ message: 'Forbidden access: Admin only' });
        }
        next();
    }
    catch (err) {
        res.status(500).send({ message: 'Internal error', error: err.message });
    }
};

const verifyDoctor = async (req, res, next) => {
    const email = req.user?.email;
    if (!email) return res.status(403).send({ message: 'Forbidden access' });

    try {
        const user = await usersCollection.findOne({ email });
        if (!user || user.role !== 'doctor') {
            return res.status(403).send({ message: 'Forbidden access: Doctor only' });
        }
        next();
    }
    catch (err) {
        res.status(500).send({ message: 'Internal error', error: err.message });
    }
};

const verifyPatient = async (req, res, next) => {
    const email = req.user?.email;
    if (!email) return res.status(403).send({ message: 'Forbidden access' });

    try {
        const user = await usersCollection.findOne({ email });
        if (!user || user.role !== 'patient') {
            return res.status(403).send({ message: 'Forbidden access: Patient only' });
        }
        next();
    }
    catch (err) {
        res.status(500).send({ message: 'Internal error', error: err.message });
    }
};

// ============================================================
// USER ROUTES
// ============================================================
app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await usersCollection.find({}).toArray();
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch users', error: error.message });
    }
});

app.get('/users/me', verifyToken, async (req, res) => {
    try {
        const email = req.user?.email;
        const user = await usersCollection.findOne({ email });
        res.send(user || {});
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch user', error: error.message });
    }
});

app.post('/users', async (req, res) => {
    try {
        const user = req.body;
        const existing = await usersCollection.findOne({ email: user.email });
        if (existing) {
            return res.send({ message: 'User already exists', inserted: false });
        }
        const newUser = { ...user, createdAt: new Date(), status: 'active' };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to create user', error: error.message });
    }
});

app.patch('/users/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { status } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status } };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to update user status', error: error.message });
    }
});

app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await usersCollection.deleteOne(query);
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to delete user', error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('MediCare Connect Server is running');
});

app.use(checkDbConnection);

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`MediCare Connect Server is running on port: ${port}`);
    });
}

module.exports = app;
