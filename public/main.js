// Function to mark reserved slots based on fetched reservation data
const markReservedSlots = (reservations) => {
  const scheduleDiv = document.getElementById("schedule");
  scheduleDiv.innerHTML = ""; // Clear existing slots

  reservations.forEach((reservation) => {
    const slot = document.createElement("div");
    slot.classList.add("slot");
    slot.dataset.time = reservation.time;

    // Slot Header
    const slotHeader = document.createElement("div");
    slotHeader.classList.add("slot-header");
    
    const timeElement = document.createElement("div");
    timeElement.classList.add("slot-time");
    timeElement.textContent = reservation.time;
    
    const statusElement = document.createElement("div");
    statusElement.classList.add("slot-status");
    
    // Determine slot status
    if (reservation.state === "r") {
      statusElement.textContent = "Reserved";
      statusElement.classList.add("reserved");
      slot.classList.add("reserved");
    } else if (reservation.state === "p") {
      statusElement.textContent = "Pending";
      statusElement.classList.add("pending");
      slot.classList.add("pending");
    } else {
      statusElement.textContent = "Available";
      statusElement.classList.add("free");
    }
    
    slotHeader.appendChild(timeElement);
    slotHeader.appendChild(statusElement);
    slot.appendChild(slotHeader);

    // Slot Details
    if (reservation.reason) {
      const detailsDiv = document.createElement("div");
      detailsDiv.classList.add("slot-details");
      
      const reasonElement = document.createElement("div");
      reasonElement.classList.add("slot-reason");
      reasonElement.textContent = reservation.reason;
      detailsDiv.appendChild(reasonElement);
      
      slot.appendChild(detailsDiv);
    }

    // Slot Footer
    if (reservation.email) {
      const footerDiv = document.createElement("div");
      footerDiv.classList.add("slot-footer");
      
      const emailElement = document.createElement("div");
      emailElement.classList.add("slot-email");
      emailElement.textContent = reservation.email;
      
      footerDiv.appendChild(emailElement);
      slot.appendChild(footerDiv);
    }

    // Slot Selection Logic
    if (!slot.classList.contains("reserved") && !slot.classList.contains("pending")) {
      slot.addEventListener("click", () => {
        slot.classList.toggle("selected");
      });
    }

    scheduleDiv.appendChild(slot);
  });
};

// Fetch reserved slots from the server when the page loads
window.addEventListener("load", async () => {
  const dateInput = document.getElementById("dateInput");
  const hiddenDate = document.getElementById("hiddenDate");
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
  hiddenDate.value = today;

  const fetchReservations = async (date) => {
    try {
      const response = await fetch(`/api/reservations?date=${date}`);
      const data = await response.json();
      renderSchedule(data.reservations);
      markReservedSlots(data.reservations);
    } catch (error) {
      console.error("Error fetching reservations:", error);
    }
  };

  await fetchReservations(today);

  dateInput.addEventListener("change", async (e) => {
    const selectedDate = e.target.value;
    hiddenDate.value = selectedDate;
    await fetchReservations(selectedDate);
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

  // Re-attach event listeners to the new slots
  document.querySelectorAll(".slot").forEach((slot) => {
    slot.addEventListener("click", () => {
      if (!slot.classList.contains("reserved") && !slot.classList.contains("pending")) {
        slot.classList.toggle("selected");
      }
    });
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
  const date = document.getElementById("hiddenDate").value.trim();

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
      body: JSON.stringify({ email, reason, slots: selectedSlots, date })
    });

    const data = await response.json();

    if (data.success) {
      // Mark the newly reserved slots in the UI as pending
      document.querySelectorAll(".slot.selected").forEach((slot) => {
        slot.classList.remove("selected");
        slot.classList.add("pending"); // Changed from "reserved" to "pending"
        const infoDiv = document.createElement("div");
        infoDiv.classList.add("info");
        infoDiv.innerHTML = `<strong>Pending approval</strong><br>${email}<br><strong>Reason:</strong><br>${reason}`;
        slot.innerHTML = "";
        slot.appendChild(infoDiv);
      });
      alert("Reservation request submitted! You will receive an email when it's approved.");
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