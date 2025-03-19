document.addEventListener("DOMContentLoaded", function () {
    // Elementer
    const todoButton = document.getElementById("todo-button");
    const todoInput = document.getElementById("todo-input");
    const todoList = document.getElementById("todo-list");
    const todoStatus = document.getElementById("todo-status");
    const authSection = document.getElementById("auth-section");
    const todoSection = document.getElementById("todo-section");
    const userNameSpan = document.getElementById("user-name");

    // Sjekk om vi har en lagret token
    const token = localStorage.getItem("token");
    if (token) {
        // Valider token og vis todo-seksjonen hvis gyldig
        validateToken(token);
    }

    // Sett opp klikk-hendelse for knappen
    if (todoButton) {
        todoButton.addEventListener("click", leggTilTodo);
    }

    // Sett opp Enter-tast for input-felt
    if (todoInput) {
        todoInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                leggTilTodo();
            }
        });
    }

    // Funksjon for å validere token
    async function validateToken(token) {
        try {
            const response = await fetch("/todos", {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                visApplikasjonen(token);
                hentTodos();
            } else {
                // Token er ugyldig eller utløpt
                localStorage.removeItem("token");
                visInnloggingSkjema();
            }
        } catch (error) {
            console.error("Feil ved validering av token:", error);
            visInnloggingSkjema();
        }
    }

    // Vis applikasjon-funksjon
    function visApplikasjonen(token) {
        try {
            // Dekoder token for å få brukernavn (uten å verifisere signatur)
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(window.atob(base64));
            
            if (userNameSpan) {
                userNameSpan.textContent = payload.username;
            }
            
            authSection.classList.add("hidden");
            todoSection.classList.remove("hidden");
        } catch (error) {
            console.error("Feil ved dekoding av JWT:", error);
        }
    }

    // Vis innlogging-skjema
    function visInnloggingSkjema() {
        authSection.classList.remove("hidden");
        todoSection.classList.add("hidden");
    }

    // Henter todos fra serveren
    async function hentTodos() {
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                throw new Error("Ingen token funnet");
            }

            const response = await fetch("/todos", {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token utløpt, prøv å fornye
                    await fornyToken();
                    return hentTodos(); // Prøv på nytt etter token-fornyelse
                }
                throw new Error("Feil ved henting av todos");
            }

            const todos = await response.json();
            oppdaterTodoListe(todos);
        } catch (error) {
            console.error("Kunne ikke hente todos:", error);
            visStatusMelding(todoStatus, "Kunne ikke hente oppgaver: " + error.message, "error");
            
            // Vis innloggingsskjema hvis det er et autorisasjonsproblem
            if (error.message.includes("token")) {
                localStorage.removeItem("token");
                visInnloggingSkjema();
            }
        }
    }

    // Oppdater todo-liste i grensesnittet
    function oppdaterTodoListe(todos) {
        if (!todoList) return;
        
        todoList.innerHTML = ""; // Tømmer listen før oppdatering

        if (todos.length === 0) {
            const emptyMessage = document.createElement("p");
            emptyMessage.textContent = "Ingen oppgaver ennå. Legg til din første oppgave!";
            todoList.appendChild(emptyMessage);
            return;
        }

        todos.forEach(todo => {
            const li = document.createElement("li");
            if (todo.completed) {
                li.classList.add("completed");
            }
            
            // Oppgavetekst
            const todoText = document.createElement("span");
            todoText.textContent = todo.title;
            todoText.className = "todo-text";
            li.appendChild(todoText);
            
            // Knapper for handlinger
            const actions = document.createElement("div");
            actions.className = "actions";
            
            // Toggle-knapp for fullført/ikke fullført
            const toggleKnapp = document.createElement("button");
            toggleKnapp.className = "toggle";
            toggleKnapp.textContent = todo.completed ? "↺" : "✓";
            toggleKnapp.title = todo.completed ? "Merk som ikke fullført" : "Merk som fullført";
            toggleKnapp.addEventListener("click", () => toggleTodoStatus(todo.id, todo.title, !todo.completed));
            
            // Slett-knapp
            const slettKnapp = document.createElement("button");
            slettKnapp.className = "delete";
            slettKnapp.textContent = "❌";
            slettKnapp.title = "Slett oppgave";
            slettKnapp.addEventListener("click", () => slettTodo(todo.id));
            
            actions.appendChild(toggleKnapp);
            actions.appendChild(slettKnapp);
            li.appendChild(actions);
            
            todoList.appendChild(li);
        });
    }

    // Legger til en ny todo
    async function leggTilTodo() {
        if (!todoInput) return;
        
        const title = todoInput.value.trim();
        if (!title) {
            visStatusMelding(todoStatus, "Oppgavetekst kan ikke være tom!", "error");
            return;
        }

        try {
            const token = localStorage.getItem("token");
            if (!token) {
                throw new Error("Ingen token funnet");
            }

            const response = await fetch("/todos", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ title })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    await fornyToken();
                    return leggTilTodo(); // Prøv på nytt etter token-fornyelse
                }
                throw new Error("Kunne ikke legge til todo");
            }

            todoInput.value = ""; // Tømmer input-feltet
            visStatusMelding(todoStatus, "Oppgave lagt til!", "success");
            hentTodos(); // Oppdaterer listen
        } catch (error) {
            console.error("Feil ved legging til todo:", error);
            visStatusMelding(todoStatus, "Kunne ikke legge til oppgave: " + error.message, "error");
        }
    }

    // Toggle todo status (fullført/ikke fullført)
    async function toggleTodoStatus(id, title, completed) {
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                throw new Error("Ingen token funnet");
            }

            const response = await fetch(`/todos/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ title, completed })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    await fornyToken();
                    return toggleTodoStatus(id, title, completed); // Prøv på nytt
                }
                throw new Error("Kunne ikke oppdatere oppgavestatus");
            }

            visStatusMelding(todoStatus, "Oppgavestatus oppdatert!", "success");
            hentTodos(); // Oppdaterer listen
        } catch (error) {
            console.error("Feil ved oppdatering av oppgavestatus:", error);
            visStatusMelding(todoStatus, "Kunne ikke oppdatere status: " + error.message, "error");
        }
    }

    // Sletter en todo
    async function slettTodo(id) {
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                throw new Error("Ingen token funnet");
            }

            const response = await fetch(`/todos/${id}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    await fornyToken();
                    return slettTodo(id); // Prøv på nytt etter token-fornyelse
                }
                throw new Error("Kunne ikke slette todo");
            }

            visStatusMelding(todoStatus, "Oppgave slettet!", "success");
            hentTodos(); // Oppdaterer listen etter sletting
        } catch (error) {
            console.error("Feil ved sletting av todo:", error);
            visStatusMelding(todoStatus, "Kunne ikke slette oppgave: " + error.message, "error");
        }
    }

    // Fornyer JWT token
    async function fornyToken() {
        try {
            const oldToken = localStorage.getItem("token");
            if (!oldToken) {
                throw new Error("Ingen token å fornye");
            }

            const response = await fetch("/refresh-token", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${oldToken}`
                }
            });

            if (!response.ok) {
                throw new Error("Kunne ikke fornye token");
            }

            const data = await response.json();
            localStorage.setItem("token", data.token);
            return true;
        } catch (error) {
            console.error("Feil ved fornyelse av token:", error);
            localStorage.removeItem("token");
            visInnloggingSkjema();
            return false;
        }
    }

    // Viser statusmeldinger
    function visStatusMelding(element, melding, type) {
        if (!element) return;
        
        element.textContent = melding;
        element.className = "status " + type;
        
        // Fjern meldingen etter 3 sekunder
        setTimeout(() => {
            element.textContent = "";
            element.className = "status";
        }, 3000);
    }

    // Gjør funksjoner tilgjengelig globalt
    window.hentTodos = hentTodos;
    window.visInnloggingSkjema = visInnloggingSkjema;
});

// Logg inn funksjon
async function loggInn() {
    const username = document.getElementById("brukernavn").value;
    const password = document.getElementById("passord").value;
    const statusEl = document.getElementById("login-status");

    if (!username || !password) {
        visStatusMelding(statusEl, "Brukernavn og passord må fylles ut", "error");
        return;
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            visStatusMelding(statusEl, "Innlogging vellykket!", "success");
            
            setTimeout(() => {
                document.getElementById("auth-section").classList.add("hidden");
                document.getElementById("todo-section").classList.remove("hidden");
                
                // Dekoder token for å vise brukernavn
                try {
                    const base64Url = data.token.split('.')[1];
                    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                    const payload = JSON.parse(window.atob(base64));
                    document.getElementById("user-name").textContent = payload.username;
                } catch (error) {
                    console.error("Kunne ikke dekode token", error);
                }
                
                window.hentTodos(); // Henter todos etter innlogging
            }, 1000);
        } else {
            visStatusMelding(statusEl, data.error || "Feil brukernavn eller passord", "error");
        }
    } catch (error) {
        visStatusMelding(statusEl, "Feil ved innlogging!", "error");
    }
}

// Registrer bruker
async function registrer() {
    const username = document.getElementById("reg-brukernavn").value;
    const password = document.getElementById("reg-passord").value;
    const statusEl = document.getElementById("register-status");

    if (!username || !password) {
        visStatusMelding(statusEl, "Brukernavn og passord må fylles ut", "error");
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            visStatusMelding(statusEl, "Registrering vellykket! Du kan nå logge inn.", "success");
            
            setTimeout(() => {
                visInnlogging();
            }, 2000);
        } else {
            visStatusMelding(statusEl, data.error || "Feil ved registrering", "error");
        }
    } catch (error) {
        visStatusMelding(statusEl, "Feil ved registrering!", "error");
    }
}

// Logg ut funksjon
function loggUt() {
    localStorage.removeItem('token');
    document.getElementById("auth-section").classList.remove("hidden");
    document.getElementById("todo-section").classList.add("hidden");
    document.getElementById("brukernavn").value = "";
    document.getElementById("passord").value = "";
}

// Vis registrering-skjema
function visRegistrering() {
    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("register-form").classList.remove("hidden");
}

// Vis innlogging-skjema
function visInnlogging() {
    document.getElementById("login-form").classList.remove("hidden");
    document.getElementById("register-form").classList.add("hidden");
}

// Hjelpefunksjon for statusmeldinger
function visStatusMelding(element, melding, type) {
    if (!element) return;
    
    element.textContent = melding;
    element.className = "status " + type;
    
    // Fjern meldingen etter 3 sekunder hvis det er en suksessmelding
    if (type === "success") {
        setTimeout(() => {
            element.textContent = "";
            element.className = "status";
        }, 3000);
    }
}