// Function to mark reserved slots based on fetched reservation data
const markReservedSlots = (reservations) => {
  reservations.forEach((reservation) => {
    const slot = document.querySelector(`.slot[data-time="${reservation.time}"]`);
    if (slot) {
      if (reservation.state != "f") {
        slot.classList.add("reserved");
        const infoDiv = document.createElement("div");
        infoDiv.classList.add("info");
        infoDiv.innerHTML = `<strong>Reserved by:</strong><br>${reservation.email}<br><strong>Reason:</strong><br>${reservation.reason}`;
        slot.innerHTML = "";
        slot.appendChild(infoDiv);
      } else {
        slot.classList.remove("reserved");
        slot.innerHTML = reservation.time;
      }
    }
  });
};

// Fetch reserved slots from the server when the page loads
window.addEventListener("load", async () => {
  try {
    const response = await fetch("/api/reservations");
    const data = await response.json();
    renderSchedule(data.reservations);
    markReservedSlots(data.reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
  }

  // Allow selection of available slots
  document.querySelectorAll(".slot").forEach((slot) => {
    slot.addEventListener("click", () => {
      if (!slot.classList.contains("reserved")) {
        slot.classList.toggle("selected");
      }
    });
  });
});

// Function to render the schedule based on fetched reservation data
const renderSchedule = (reservations) => {
  const scheduleDiv = document.getElementById("schedule");
  scheduleDiv.innerHTML = ""; // Clear existing slots
  reservations.forEach((reservation) => {
    const slot = document.createElement("div");
    slot.classList.add("slot");
    slot.dataset.time = reservation.time;
    slot.textContent = reservation.time;
    scheduleDiv.appendChild(slot);
  });
};

// Modal handling and reservation form submission remain unchanged
const modal = document.getElementById("reservationModal");
const closeModal = document.querySelector(".modal .close");
const reserveBtn = document.getElementById("reserveBtn");

reserveBtn.addEventListener("click", () => {
  const selectedSlots = document.querySelectorAll(".slot.selected");
  if (selectedSlots.length === 0) {
    alert("Please select at least one available slot.");
    return;
  }
  modal.style.display = "block";
});

closeModal.addEventListener("click", () => {
  modal.style.display = "none";
});

window.addEventListener("click", (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
});

const reservationForm = document.getElementById("reservationForm");
reservationForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const reason = document.getElementById("reason").value.trim();

  // Gather selected slots
  const selectedSlots = Array.from(document.querySelectorAll(".slot.selected"))
    .map(slot => slot.dataset.time);

  if (selectedSlots.length === 0) {
    alert("No slots selected.");
    return;
  }

  // Send reservation data to the server
  try {
    const response = await fetch("/api/reserve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, reason, slots: selectedSlots })
    });

    const responseText = await response.text();
    console.log("Response text:", responseText);

    const data = JSON.parse(responseText);

    if (data.success) {
      // Mark the newly reserved slots in the UI
      document.querySelectorAll(".slot.selected").forEach((slot) => {
        slot.classList.remove("selected");
        slot.classList.add("reserved");
        const infoDiv = document.createElement("div");
        infoDiv.classList.add("info");
        infoDiv.innerHTML = `<strong>Reserved by:</strong><br>${email}<br><strong>Reason:</strong><br>${reason}`;
        slot.innerHTML = "";
        slot.appendChild(infoDiv);
      });
      alert("Reservation confirmed! A confirmation email has been sent.");
    } else {
      alert("There was an error processing your reservation. Please try again.");
    }
  } catch (error) {
    console.error("Error processing reservation:", error);
    alert("Error processing reservation: " + error.message);
  }

  reservationForm.reset();
  modal.style.display = "none";
});