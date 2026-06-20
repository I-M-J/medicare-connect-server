# MediCare Connect — Server

Backend API server for MediCare Connect, a modern hospital appointment & healthcare management system.

## 🚀 Live Server

> _Link will be added after deployment_

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Native Driver — no Mongoose)
- **Authentication**: Better Auth (JWKS token verification via `jose-cjs`)
- **Payment**: Stripe
- **Deployment**: Vercel

## 📦 Installation

```bash
npm install
```

## ▶️ Run Locally

```bash
npm run dev
```

Server will start at `http://localhost:5000`

## 🔐 Environment Variables

Create a `.env` file in the root directory:

```env
MONGODB_URI=your_mongodb_connection_string
PORT=5000
CLIENT_URL=http://localhost:3000
STRIPE_SECRET_KEY=your_stripe_secret_key
ADMIN_EMAIL=admin@medicare.com
ADMIN_PASSWORD=Admin@12345
```

## 👤 Admin Credentials

| Field    | Value                  |
|----------|------------------------|
| Email    | admin@medicare.com     |
| Password | Admin@12345            |

> The admin account is automatically seeded into the database on server startup.

## 🔒 JWT / Auth Implementation

This server uses **Better Auth** on the client side for session management. Token verification is done server-side using `jose-cjs`:

```js
const JWKS = createRemoteJWKSet(new URL(`${CLIENT_URL}/api/auth/jwks`));
const { payload } = await jwtVerify(token, JWKS);
```

The client sends a `Bearer` token in the `Authorization` header. The server verifies the token against the client's JWKS endpoint.

**Role-based middleware:**
- `verifyToken` — validates the JWT token
- `verifyAdmin` — checks `role === 'admin'` in MongoDB
- `verifyDoctor` — checks `role === 'doctor'`
- `verifyPatient` — checks `role === 'patient'`

## 📡 API Endpoints

### Public
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Health check |
| GET | `/stats` | Platform statistics |
| GET | `/doctors` | List doctors (with search, sort, pagination) |
| GET | `/doctors/featured` | Featured verified doctors |
| GET | `/doctors/:id` | Doctor details |
| GET | `/reviews` | Reviews (filter by doctorId) |

### Protected (Patient)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/appointments` | Book appointment |
| GET | `/appointments/patient` | My appointments |
| PATCH | `/appointments/:id/reschedule` | Reschedule |
| DELETE | `/appointments/:id` | Cancel appointment |
| GET | `/payments` | My payment history |
| POST | `/payments` | Record payment |
| POST | `/create-payment-intent` | Stripe payment intent |
| POST | `/reviews` | Add review |
| PATCH | `/reviews/:id` | Update review |
| DELETE | `/reviews/:id` | Delete review |

### Protected (Doctor)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/doctors/my` | My doctor profile |
| POST | `/doctors` | Create doctor profile |
| PATCH | `/doctors/:id` | Update profile |
| GET | `/appointments/doctor` | My appointments |
| PATCH | `/appointments/:id/status` | Accept/reject/complete |
| GET | `/prescriptions` | My prescriptions |
| POST | `/prescriptions` | Create prescription |
| PATCH | `/prescriptions/:id` | Update prescription |

### Protected (Admin)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/users` | All users |
| PATCH | `/users/:id/status` | Suspend/activate user |
| DELETE | `/users/:id` | Delete user |
| PATCH | `/doctors/:id/verify` | Verify/reject doctor |
| GET | `/appointments` | All appointments |
| GET | `/admin/analytics` | Analytics data |

## 📁 Project Structure

```
medicare-connect-server/
├── index.js          # Main server file (all routes)
├── package.json
├── vercel.json       # Vercel deployment config
├── .env              # Environment variables (gitignored)
├── .env.example      # Environment variables template
└── .gitignore
```
