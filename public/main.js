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
const fetchReservations = async (date) => {
  try {
    const response = await fetch(`/api/reservations?date=${date}`);
    const data = await response.json();
    markReservedSlots(data.reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
  }
};

window.addEventListener("load", async () => {
  const dateInput = document.getElementById("dateInput");
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
  await fetchReservations(today);

  dateInput.addEventListener("change", async (e) => {
    await fetchReservations(e.target.value);
  });
});

// Modal handling
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

// Reservation handling
const reservationForm = document.getElementById("reservationForm");
reservationForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const reason = document.getElementById("reason").value.trim();
  const dateInput = document.getElementById("dateInput");
  const date = dateInput ? dateInput.value.trim() : new Date().toISOString().split('T')[0];
  const selectedSlots = Array.from(document.querySelectorAll(".slot.selected"))
    .map(slot => slot.dataset.time);

  if (selectedSlots.length === 0) {
    alert("No slots selected.");
    return;
  }

  try {
    const response = await fetch("/api/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, reason, slots: selectedSlots, date })
    });

    const data = await response.json();

    if (data.success) {
      selectedSlots.forEach(time => {
        const slot = document.querySelector(`.slot[data-time='${time}']`);
        if (slot) {
          slot.classList.remove("selected");
          slot.classList.add("pending");
          slot.innerHTML = `
            <div class="slot-header">
              <div class="slot-time">${time}</div>
              <div class="slot-status pending">Pending</div>
            </div>
            <div class="slot-details">
              <div class="slot-reason">${reason}</div>
            </div>
            <div class="slot-footer">
              <div class="slot-email">${email}</div>
            </div>
          `;
        }
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
