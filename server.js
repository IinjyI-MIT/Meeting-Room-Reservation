const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const path = require("path");
const cron = require("node-cron");

const app = express();

// Parse JSON bodies
app.use(bodyParser.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// In-memory array to store reservations (use a database in production)
let reservations = [];

// Endpoint to get all reservations
app.get("/reservations", (req, res) => {
  res.json({ reservations });
});

// Endpoint to handle reservation requests
app.post("/reserve", async (req, res) => {
  const { email, reason, slots } = req.body;

  // Create a Nodemailer transporter with your SMTP settings
  let transporter = nodemailer.createTransport({
    host: "mail.measuresofteg.com",
    port: 465,
    secure: true,
    auth: {
      user: "reservation@measuresofteg.com",
      pass: "Rre$erv@t!0nmos" // replace with the actual password
    }
  });

  // Prepare the email
  const mailOptions = {
    from: "reservation@measuresofteg.com",
    to: email,
    subject: "Meeting Room Reservation Confirmation",
    text: `Hello,
    
You have reserved the meeting room for the following slots: ${slots.join(
      ", "
    )}.
Reason for reservation: ${reason}

Thank you!`
  };

  try {
    // Send the confirmation email
    let info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);

    // Save the reservation details to our in-memory store
    reservations.push({ email, reason, slots, reservedAt: new Date() });

    // Respond with success
    res.json({ success: true });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ success: false, error: error.toString() });
  }
});

// Schedule a job to reset reservations at 12:00 AM everyday
cron.schedule("0 0 * * *", () => {
  console.log("Resetting reservations at midnight.");
  reservations = [];
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
