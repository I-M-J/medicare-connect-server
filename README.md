# MediCare Connect - Server

Express and MongoDB based REST API for the MediCare Connect healthcare application.

## 🚀 Features

- **Authentication**: Custom JWT validation through `jose-cjs` verifying tokens from Better-Auth.
- **Role-Based Access Control**: Middleware ensuring `admin`, `doctor`, and `patient` only hit appropriate routes.
- **Database**: Native MongoDB Node.js driver (no Mongoose or ORM).
- **Payment Processing**: Stripe API integration for handling appointment payments.

## 🛠️ Tech Stack

- Node.js & Express.js
- MongoDB (Native Driver)
- JSON Web Tokens (via `jose-cjs`)
- Stripe API
- CORS & dotenv

## 📦 Setup & Run

1. Clone the repository and navigate to the server folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your `.env`:
   ```env
   PORT=5000
   MONGODB_URI=mongodb+srv://...
   CLIENT_URL=http://localhost:3000
   STRIPE_SECRET_KEY=sk_test_...
   ADMIN_EMAIL=admin@medicare.com
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## 📖 API Documentation

### Users
- `GET /users` - Get all users (Admin only)
- `GET /users/me` - Get current user profile
- `POST /users` - Register a new user
- `PATCH /users/:id/status` - Update user status (Admin only)
- `DELETE /users/:id` - Delete a user (Admin only)

### Doctors
- `GET /doctors` - Get doctors with search, filter, pagination
- `GET /doctors/featured` - Get verified featured doctors
- `GET /doctors/my` - Get current doctor profile
- `GET /doctors/:id` - Get specific doctor details
- `POST /doctors` - Create a doctor profile
- `PATCH /doctors/:id` - Update doctor details
- `PATCH /doctors/:id/verify` - Verify doctor (Admin only)

### Appointments
- `GET /appointments` - Get all appointments (Admin only)
- `GET /appointments/patient` - Get current patient appointments
- `GET /appointments/doctor` - Get current doctor appointment requests
- `POST /appointments` - Create a new appointment
- `PATCH /appointments/:id/status` - Update appointment status
- `PATCH /appointments/:id/reschedule` - Reschedule appointment
- `DELETE /appointments/:id` - Cancel appointment

### Prescriptions & Reviews
- `GET /prescriptions` - Fetch prescriptions by filters
- `POST /prescriptions` - Issue a new prescription
- `GET /reviews` - Fetch reviews for a doctor
- `POST /reviews` - Submit a review
- `DELETE /reviews/:id` - Delete a review

### Payments
- `GET /payments` - Fetch payment history
- `POST /payments` - Record a successful payment
- `POST /create-payment-intent` - Create Stripe PaymentIntent
