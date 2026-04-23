document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const todoList = document.getElementById('todo-list');
    const newTodoInput = document.getElementById('new-todo-input');
    const dueDateInput = document.getElementById('due-date-input');
    const priorityInput = document.getElementById('priority-input');
    const categoryInput = document.getElementById('category-input');
    const addTodoBtn = document.getElementById('add-todo-btn');
    
    // Management Console Elements
    const priorityFilter = document.getElementById('priority-filter');
    const taskSearch = document.getElementById('task-search');
    const clearBtn = document.getElementById('clear-completed-btn'); // Ensure this ID exists in HTML
    
    const API_URL = '/api/todos';
    let allTodos = []; // Master list from DB

    // 1. Notification Logic
    const showToast = (msg) => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `[SUCCESS] ${msg}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    // 2. Stats & Progress Logic
    const updateUI = (todos) => {
        const total = todos.length;
        const done = todos.filter(t => t.completed).length;
        const pending = total - done;
        const progress = total === 0 ? 0 : (done / total) * 100;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-done').textContent = done;
        
        const taskCountEl = document.getElementById('task-count');
        const taskProgressEl = document.getElementById('task-progress');
        
        if (taskCountEl) taskCountEl.textContent = `${total} Tasks`;
        if (taskProgressEl) taskProgressEl.style.width = `${progress}%`;
    };

    // 3. API & Rendering
    const fetchTodos = async () => {
        try {
            const res = await fetch(API_URL);
            allTodos = await res.json();
            applyFilters(); 
        } catch (e) {
            console.error("Fetch error:", e);
        }
    };

    const applyFilters = () => {
        const pFilter = priorityFilter.value;
        const searchText = taskSearch.value.toLowerCase().trim();

        const filtered = allTodos.filter(t => {
            const matchesPriority = (pFilter === 'all' || t.priority.toString() === pFilter);
            const matchesSearch = (
                t.title.toLowerCase().includes(searchText) || 
                (t.category && t.category.toLowerCase().includes(searchText))
            );
            return matchesPriority && matchesSearch;
        });
        
        renderTodos(filtered);
        updateUI(allTodos); 
    };

    const renderTodos = (todos) => {
        todoList.innerHTML = '';
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        todos.forEach(t => {
            const isDone = t.completed;
            const prioLabel = t.priority == 3 ? 'HIGH' : t.priority == 2 ? 'MED' : 'LOW';
            const categoryLower = t.category ? t.category.toLowerCase() : '';
            const badgeClass = categoryLower === 'aws' ? 'badge-aws' : 
                               categoryLower === 'saas' ? 'badge-saas' : 'badge-default';

            let dueStatusClass = '';
            let dateDisplay = 'N/A';
            if (t.dueDate) {
                const taskDate = new Date(t.dueDate);
                const compareDate = new Date(taskDate);
                compareDate.setHours(0, 0, 0, 0);
                dateDisplay = taskDate.toLocaleDateString();
                if (!isDone && compareDate <= today) dueStatusClass = 'due-urgent';
            }

            const li = document.createElement('li');
            li.className = 'todo-item';
            li.innerHTML = `
                <div>
                    <span class="todo-title" style="${isDone ? 'text-decoration:line-through;opacity:0.5' : ''}">${t.title}</span>
                    <div class="todo-metadata">
                        <span class="${dueStatusClass}">[DATE: ${dateDisplay}]</span>
                        <span>[TAG: <span class="badge ${badgeClass}">${t.category || 'General'}</span>]</span>
                        <span class="priority-${prioLabel.toLowerCase()}">[PRIO: ${prioLabel}]</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <input type="checkbox" ${isDone ? 'checked' : ''} 
                        onchange="toggleComplete(${t.id}, ${isDone})" 
                        style="transform: scale(1.4); cursor: pointer;">
                    <button class="delete-btn" onclick="deleteTodo(${t.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            todoList.appendChild(li);
        });
    };

    // 4. CRUD Operations
    const addTodo = async () => {
        const title = newTodoInput.value.trim();
        if (!title) return;
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    dueDate: dueDateInput.value || null,
                    priority: parseInt(priorityInput.value),
                    category: categoryInput.value || 'General'
                }),
            });
            if (res.ok) {
                newTodoInput.value = '';
                showToast(`Task deployed successfully_`);
                fetchTodos();
            }
        } catch (e) { console.error("Add error:", e); }
    };

    window.toggleComplete = async (id, currentStatus) => {
        try {
            const res = await fetch(`${API_URL}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: !currentStatus }),
            });
            if (res.ok) fetchTodos();
        } catch (e) { console.error("Toggle error:", e); }
    };

    window.deleteTodo = async (id) => {
        try {
            const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast("Unit purged from registry_");
                fetchTodos();
            }
        } catch (e) { console.error("Delete error:", e); }
    };

    // --- CRITICAL FIX FOR CLEAR COMPLETED ---
    window.clearCompleted = async () => {
        if (!confirm("Purge all finished tasks?")) return;
        try {
            // Updated to the specific endpoint you defined in routes/todos.js
            const res = await fetch(`${API_URL}/clear-completed`, { 
                method: 'DELETE' 
            });
            
            if (res.ok) {
                showToast("Registry cleanup successful_");
                fetchTodos();
            } else {
                console.error("Server responded with error during cleanup");
            }
        } catch (e) { console.error("Cleanup error:", e); }
    };

    // 5. Event Listeners
    addTodoBtn.addEventListener('click', addTodo);
    newTodoInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTodo(); });
    
    // LIVE Search & Filter listeners
    priorityFilter.addEventListener('change', applyFilters);
    taskSearch.addEventListener('input', applyFilters);

    // If you have a dedicated clear button in HTML, attach the listener:
    if (clearBtn) {
        clearBtn.addEventListener('click', window.clearCompleted);
    }

    fetchTodos();
});