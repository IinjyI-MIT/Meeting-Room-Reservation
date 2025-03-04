const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const { createClient } = require("@libsql/client");
const path = require("path");

const app = express();
app.use(bodyParser.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public"), { extensions: ['html'] }));

// Serve index.html explicitly for the root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Simple middleware for basic auth protection
function adminAuthMiddleware(req, res, next) {
  // This is a very basic implementation - you should use more secure methods in production
  const AUTH_USERNAME = "admin";
  const AUTH_PASSWORD = "admin123"; // Change this to your preferred password

  // Check if Authorization header exists
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).send('Authentication required');
  }
  
  // Parse the Authorization header
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const username = auth[0];
  const password = auth[1];
  
  // Check if credentials match
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).send('Invalid credentials');
  }
}

// Serve admin page
app.get("/admin", adminAuthMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});

// Replace these with your actual Turso database credentials
const TURSO_URL = "libsql://meeting-room-reservation-iinjyi-mit.turso.io"; // Replace with your Turso URL
const TURSO_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3MzkxMjg0MDMsImlkIjoiMDQ5ZjA2ZmEtODBiMC00OTk5LTk0NjEtZTA4OGUwYzVjYjZhIn0.-zkms14H4gU805AFLWqPjYzzsu2rnVGp2VZTxVf0PV0amnLzyjy4JHkdGP-G8W5kYSRKvloR2oLs-2ayhqDiAQ"; // Replace with your Turso auth token

const db = createClient({ url: TURSO_URL, authToken: TURSO_AUTH_TOKEN });

// Function to convert 24-hour time to 12-hour format with AM/PM
const convertTo12HourFormat = (time) => {
  const [hour, minute] = time.split(':');
  const hourInt = parseInt(hour, 10);
  const period = hourInt >= 12 ? 'PM' : 'AM';
  const hour12 = hourInt % 12 || 12;
  return `${hour12}:${minute} ${period}`;
};

// Ensure reservations table exists and insert initial data
async function initializeDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reservations (
      time TEXT,
      date TEXT,
      state TEXT,
      email TEXT,
      reason TEXT,
      PRIMARY KEY (time, date)
    );
  `);

  // Check if the reservations table is empty
  const result = await db.execute("SELECT COUNT(*) as count FROM reservations");
  const count = result.rows[0].count;

  // If the table is empty, insert data for the next seven days with times from 9 AM to 5 PM
  if (count === 0) {
    const today = new Date();
    const times = Array.from({ length: 9 }, (_, i) => `${9 + i}:00`).map(convertTo12HourFormat);

    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + i);
      const dateString = nextDate.toISOString().split('T')[0];

      const reservations = times.map(time => ({
        time,
        date: dateString,
        state: "f",
        email: "",
        reason: ""
      }));

      await writeReservations(reservations);
    }
  }
}
initializeDatabase();

// Read reservations from Turso
async function readReservations(date) {
  let result;
  if (date) {
    result = await db.execute("SELECT * FROM reservations WHERE date = ?", [date]);
  } else {
    result = await db.execute("SELECT * FROM reservations");
  }
  return result.rows;
}

// Write reservations to Turso
async function writeReservations(reservations) {
  const queries = reservations.map((res) => ({
    sql: `
      INSERT INTO reservations (time, date, state, email, reason)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(time, date) DO UPDATE SET 
        state = excluded.state,
        email = excluded.email,
        reason = excluded.reason;
    `,
    args: [res.time, res.date, res.state, res.email, res.reason],
  }));

  await db.batch(queries);
}

// Get reservations
app.get("/api/reservations", async (req, res) => {
  const { date } = req.query;
  try {
    const reservations = await readReservations(date);
    res.json({ reservations });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching reservations" });
  }
});

// Get pending reservations for admin
app.get("/api/pending-reservations", adminAuthMiddleware, async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM reservations WHERE state = 'p' ORDER BY date, time");
    res.json({ reservations: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching pending reservations" });
  }
});

// Make a reservation - now sets state to pending ("p") instead of reserved ("r")
app.post("/api/reserve", async (req, res) => {
  const { email, reason, slots, date } = req.body;

  try {
    const reservations = await readReservations(date);

    slots.forEach((slotTime) => {
      const reservation = reservations.find((r) => r.time === slotTime);
      if (reservation) {
        // Set to pending state instead of reserved
        reservation.state = "p";
        reservation.email = email;
        reservation.reason = reason;
      }
    });

    await writeReservations(reservations);

    // Send email notification to user that their reservation is pending approval
    let transporter = nodemailer.createTransport({
      host: "mail.measuresofteg.com",
      port: 465,
      secure: true,
      auth: {
        user: "reservation@measuresofteg.com",
        pass: "Rre$erv@t!0nmos",
      },
    });

    transporter.sendMail({
      from: "reservation@measuresofteg.com",
      to: email,
      subject: "Meeting Room Reservation Pending Approval",
      text: `Your reservation request for: ${slots.join(", ")} on ${date} is pending administrative approval.\nReason: ${reason}\n\nYou will receive another email once your reservation has been reviewed.`,
    });

    // Notify admin by email about the pending reservation
    transporter.sendMail({
      from: "reservation@measuresofteg.com",
      to: "admin@measuresofteg.com", // Replace with actual admin email
      subject: "New Pending Meeting Room Reservation",
      text: `A new reservation request requires your approval:\n\nUser: ${email}\nDate: ${date}\nSlots: ${slots.join(", ")}\nReason: ${reason}\n\nPlease log in to the admin panel to approve or reject this request.`,
    });

    res.json({ success: true, message: "Reservation request submitted and pending approval" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error processing reservation" });
  }
});

// New endpoint for admin to approve a reservation
app.post("/api/admin/approve-reservation", adminAuthMiddleware, async (req, res) => {
  const { date, time, email } = req.body;

  try {
    // Update the reservation status to "r" (reserved)
    await db.execute(
      "UPDATE reservations SET state = 'r' WHERE date = ? AND time = ?",
      [date, time]
    );

    // Send confirmation email to the user
    let transporter = nodemailer.createTransport({
      host: "mail.measuresofteg.com",
      port: 465,
      secure: true,
      auth: {
        user: "reservation@measuresofteg.com",
        pass: "Rre$erv@t!0nmos",
      },
    });

    transporter.sendMail({
      from: "reservation@measuresofteg.com",
      to: email,
      subject: "Meeting Room Reservation Approved",
      text: `Your reservation for ${time} on ${date} has been approved.`,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error approving reservation:", error);
    res.status(500).json({ success: false, message: "Error approving reservation" });
  }
});

// New endpoint for admin to reject a reservation
app.post("/api/admin/reject-reservation", adminAuthMiddleware, async (req, res) => {
  const { date, time, email, rejectionReason } = req.body;

  try {
    // Update the reservation status back to "f" (free)
    await db.execute(
      "UPDATE reservations SET state = 'f', email = '', reason = '' WHERE date = ? AND time = ?",
      [date, time]
    );

    // Send rejection email to the user
    let transporter = nodemailer.createTransport({
      host: "mail.measuresofteg.com",
      port: 465,
      secure: true,
      auth: {
        user: "reservation@measuresofteg.com",
        pass: "Rre$erv@t!0nmos",
      },
    });

    transporter.sendMail({
      from: "reservation@measuresofteg.com",
      to: email,
      subject: "Meeting Room Reservation Rejected",
      text: `Your reservation for ${time} on ${date} has been rejected.\nReason: ${rejectionReason || 'No reason provided.'}`,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error rejecting reservation:", error);
    res.status(500).json({ success: false, message: "Error rejecting reservation" });
  }
});

app.get("/api/reset-reservations", async (req, res) => {
  try {
    console.log("Resetting reservations.");
    const reservations = await readReservations();
    const newReservations = [];

    // Get the current date and calculate the next week's dates
    const today = new Date();
    const times = Array.from({ length: 9 }, (_, i) => `${9 + i}:00`).map(convertTo12HourFormat);

    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + i);
      const dateString = nextDate.toISOString().split('T')[0];

      times.forEach((time) => {
        newReservations.push({
          time,
          date: dateString,
          state: "f",
          email: "",
          reason: "",
        });
      });
    }

    await writeReservations(newReservations);
    res.json({ success: true });
  } catch (error) {
    console.error("Error resetting reservations:", error);
    res.status(500).json({ success: false, message: "Error resetting reservations" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});