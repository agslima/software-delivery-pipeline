// server/app.js
const express = require("express");
const path = require("path");
const RateLimit = require("express-rate-limit");
const helmet = require("helmet"); 
const app = express();


// 1. Security: Helmet (XSS, HSTS, Frame Options)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "object-src": ["'none'"],
      "upgrade-insecure-requests": [],
    },
  },
}));

// 2. Security: Add "Permissions-Policy"
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(self), microphone=(), camera=(), payment=()"
  );
  next();
});

// 2. Security: Rate limiter
const limiter = RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// 3. Data
const prescriptionData = {
    clinicName: "StayHealthy",
    doctor: {
        name: "Dr. Emily Johnson",
        license: "12345",
        phone: "(555) 987-6543",
        email: "dr.emily@example.com"
    },
    patient: {
        name: "John Smith",
        gender: "Male",
        dob: "January 15, 1980",
        phone: "(555) 123-4567",
        email: "johnsmith@example.com"
    },
    date: "July 10, 2023",
    medications: [
        {
            name: "Amoxicillin",
            dosage: "500mg",
            directions: "Take 1 capsule three times a day with meals.",
            quantity: "30 capsules"
        },
        {
            name: "Ibuprofen",
            dosage: "200mg",
            directions: "Take 1 tablet every 6 hours as needed for pain.",
            quantity: "60 tablets"
        },
        {
            name: "Loratadine",
            dosage: "10mg",
            directions: "Take 1 tablet once daily in the morning.",
            quantity: "30 tablets"
        }
    ]
};

// 4. API Routes
app.get("/api/prescription", (req, res) => {
    res.json(prescriptionData);
});

// 5. Static Files (React Frontend)
const publicPath = path.resolve(__dirname, "../public");
app.use(express.static(publicPath));

// Handle React Routing (return index.html for unknown routes)
app.get("*", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

// Export the app
module.exports = app;
