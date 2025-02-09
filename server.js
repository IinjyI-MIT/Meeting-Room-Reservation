const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const { createClient } = require("@libsql/client");
const path = require("path");

const app = express();
app.use(bodyParser.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html explicitly for the root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
// Replace these with your actual Turso database credentials
const TURSO_URL = "libsql://meeting-room-reservation-iinjyi-mit.turso.io"; // Replace with your actual Turso URL
const TURSO_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3MzkxMjg0MDMsImlkIjoiMDQ5ZjA2ZmEtODBiMC00OTk5LTk0NjEtZTA4OGUwYzVjYjZhIn0.-zkms14H4gU805AFLWqPjYzzsu2rnVGp2VZTxVf0PV0amnLzyjy4JHkdGP-G8W5kYSRKvloR2oLs-2ayhqDiAQ"; // Replace with your Turso auth token

const db = createClient({ url: TURSO_URL, authToken: TURSO_AUTH_TOKEN });

// Ensure reservations table exists
async function initializeDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reservations (
      time TEXT PRIMARY KEY,
      state TEXT,
      email TEXT,
      reason TEXT
    );
  `);
}
initializeDatabase();

// Read reservations from Turso
async function readReservations() {
  const result = await db.execute("SELECT * FROM reservations");
  return result.rows;
}

// Write reservations to Turso
async function writeReservations(reservations) {
  const queries = reservations.map((res) => ({
    sql: `
      INSERT INTO reservations (time, state, email, reason)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(time) DO UPDATE SET 
        state = excluded.state,
        email = excluded.email,
        reason = excluded.reason;
    `,
    args: [res.time, res.state, res.email, res.reason],
  }));

  await db.batch(queries);
}

// Get reservations
app.get("/reservations", async (req, res) => {
  try {
    const reservations = await readReservations();
    res.json({ reservations });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching reservations" });
  }
});

// Make a reservation
app.post("/reserve", async (req, res) => {
  const { email, reason, slots } = req.body;

  try {
    const reservations = await readReservations();

    slots.forEach((slotTime) => {
      const reservation = reservations.find((r) => r.time === slotTime);
      if (reservation) {
        reservation.state = "r";
        reservation.email = email;
        reservation.reason = reason;
      }
    });

    await writeReservations(reservations);

    // Send email confirmation
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
      subject: "Meeting Room Reservation Confirmation",
      text: `You have reserved the meeting room for: ${slots.join(", ")}.\nReason: ${reason}`,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error processing reservation" });
  }
});

// Reset reservations at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("Resetting reservations.");
  const reservations = await readReservations();
  reservations.forEach((res) => {
    res.state = "f";
    res.email = "";
    res.reason = "";
  });
  await writeReservations(reservations);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
