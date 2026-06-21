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

// ============================================================
// DOCTOR ROUTES
// ============================================================
app.get('/doctors', async (req, res) => {
    try {
        const { search, specialization, sortBy, page, limit } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { doctorName: { $regex: search, $options: 'i' } },
                { specialization: { $regex: search, $options: 'i' } }
            ];
        }

        if (specialization) {
            query.specialization = { $regex: specialization, $options: 'i' };
        }

        let sortOption = {};
        if (sortBy === 'fee_asc') sortOption = { consultationFee: 1 };
        else if (sortBy === 'fee_desc') sortOption = { consultationFee: -1 };
        else if (sortBy === 'experience') sortOption = { experience: -1 };
        else if (sortBy === 'rating') sortOption = { averageRating: -1 };

        const parsedPage = parseInt(page) || 1;
        const parsedLimit = parseInt(limit) || 9;
        const skip = (parsedPage - 1) * parsedLimit;

        const total = await doctorsCollection.countDocuments(query);
        const doctors = await doctorsCollection.find(query).sort(sortOption).skip(skip).limit(parsedLimit).toArray();

        res.send({ total, doctors, page: parsedPage, totalPages: Math.ceil(total / parsedLimit) });
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch doctors', error: error.message });
    }
});

app.get('/doctors/featured', async (req, res) => {
    try {
        const doctors = await doctorsCollection.find({ verificationStatus: 'verified' }).limit(6).toArray();
        res.send(doctors);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch featured doctors', error: error.message });
    }
});

app.get('/doctors/my', verifyToken, async (req, res) => {
    try {
        const email = req.user?.email;
        const doctor = await doctorsCollection.findOne({ email });
        res.send(doctor || {});
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch doctor profile', error: error.message });
    }
});

app.get('/doctors/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: 'Invalid doctor ID' });
        }
        const query = { _id: new ObjectId(id) };
        const doctor = await doctorsCollection.findOne(query);
        if (!doctor) {
            return res.status(404).send({ message: 'Doctor not found' });
        }
        res.send(doctor);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch doctor', error: error.message });
    }
});

app.post('/doctors', verifyToken, async (req, res) => {
    try {
        const doctor = req.body;
        const newDoctor = {
            ...doctor,
            verificationStatus: 'pending',
            averageRating: 0,
            totalReviews: 0,
            createdAt: new Date()
        };
        const result = await doctorsCollection.insertOne(newDoctor);

        // update user role to doctor
        await usersCollection.updateOne({ email: doctor.email }, { $set: { role: 'doctor' } });

        res.status(201).send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to create doctor profile', error: error.message });
    }
});

app.patch('/doctors/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: 'Invalid doctor ID' });
        }
        const updatedData = { ...req.body };
        delete updatedData._id;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: updatedData };
        const result = await doctorsCollection.updateOne(filter, updateDoc);
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to update doctor', error: error.message });
    }
});

app.patch('/doctors/:id/verify', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const { verificationStatus } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { verificationStatus } };
        const result = await doctorsCollection.updateOne(filter, updateDoc);
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to update verification status', error: error.message });
    }
});

// ============================================================
// APPOINTMENT ROUTES
// ============================================================
app.get('/appointments', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await appointmentsCollection.find({}).toArray();
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch appointments', error: error.message });
    }
});

app.get('/appointments/patient', verifyToken, async (req, res) => {
    try {
        const email = req.user?.email;
        const query = { patientEmail: email };
        const result = await appointmentsCollection.find(query).sort({ appointmentDate: -1 }).toArray();
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch patient appointments', error: error.message });
    }
});

app.get('/appointments/doctor', verifyToken, async (req, res) => {
    try {
        const email = req.user?.email;
        const query = { doctorEmail: email };
        const result = await appointmentsCollection.find(query).sort({ appointmentDate: -1 }).toArray();
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to fetch doctor appointments', error: error.message });
    }
});

app.post('/appointments', verifyToken, async (req, res) => {
    try {
        const appointment = req.body;
        const newAppointment = {
            ...appointment,
            appointmentStatus: 'pending',
            paymentStatus: 'paid',
            createdAt: new Date()
        };
        const result = await appointmentsCollection.insertOne(newAppointment);
        res.status(201).send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to create appointment', error: error.message });
    }
});

app.patch('/appointments/:id/status', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: 'Invalid appointment ID' });
        }
        const { appointmentStatus } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { appointmentStatus } };
        const result = await appointmentsCollection.updateOne(filter, updateDoc);
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to update appointment status', error: error.message });
    }
});

app.patch('/appointments/:id/reschedule', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: 'Invalid appointment ID' });
        }
        const { appointmentDate, appointmentTime } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { appointmentDate, appointmentTime, appointmentStatus: 'pending' } };
        const result = await appointmentsCollection.updateOne(filter, updateDoc);
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to reschedule appointment', error: error.message });
    }
});

app.delete('/appointments/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: 'Invalid appointment ID' });
        }
        const query = { _id: new ObjectId(id) };
        const result = await appointmentsCollection.deleteOne(query);
        res.send(result);
    }
    catch (error) {
        res.status(500).send({ message: 'Failed to cancel appointment', error: error.message });
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
