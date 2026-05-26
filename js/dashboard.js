import {
  Client,
  Account,
  Databases,
  Storage,
  Query,
  ID
} from 'https://cdn.jsdelivr.net/npm/appwrite@25.2.0/+esm';

const CONFIG = {
  endpoint: 'https://sgp.cloud.appwrite.io/v1',
  projectId: '6a11e2ba00082db8f17a',
  databaseId: '6a1314730019b5dc83aa'
};

const client = new Client()
  .setEndpoint(CONFIG.endpoint)
  .setProject(CONFIG.projectId);

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

// State
let currentUser = null;
let currentSubscription = null;
let isPremium = false;
let currentUni = 'NUST';
let currentFilter = 'All';

// Collections mapping based on prompt
const COLS = {
  resources: 'resources', 
  pastPapers: 'past-papers',
  subscriptions: 'subscriptions',
  paymentReceipts: 'payment-receipts',
  notifications: 'notifications',
  supportTickets: 'support_tickets',
  mockTests: 'mock-tests' // Assuming mock tests collection id is 'mock-tests'
};

// --- Initialization ---
async function init() {
  try {
    currentUser = await account.get();
    document.getElementById('user-greeting-name').textContent = currentUser.name + ' 👋';
    
    // Check Subscription
    await checkSubscription();
    
    // Load initial data
    loadResources();
    loadPastPapersUnis();
    loadNotifications();
    loadMockTests();
    
    // Setup event listeners
    setupEventListeners();
  } catch (error) {
    console.error('Not logged in', error);
    window.location.href = '/login.html';
  }
}

async function checkSubscription() {
  try {
    const subs = await databases.listDocuments(CONFIG.databaseId, COLS.subscriptions, [
      Query.equal('userId', currentUser.$id)
    ]);
    if (subs.documents.length > 0) {
      currentSubscription = subs.documents[0];
      if (currentSubscription.subscriptionStatus === 'active') {
        isPremium = true;
      }
    }
  } catch (error) {
    console.error('Failed to check sub', error);
  }
}

// --- Event Listeners ---
function setupEventListeners() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await account.deleteSession('current');
    window.location.href = '/login.html';
  });

  // Resource Tabs
  document.querySelectorAll('.uni-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.uni-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentUni = e.target.getAttribute('data-uni');
      document.getElementById('selected-university-text').textContent = currentUni + ' University';
      loadResources();
    });
  });

  // Resource Filters
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.getAttribute('data-type');
      loadResources();
    });
  });

  // Premium Payment Form
  document.getElementById('premium-payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-payment-btn');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader"></i> Submitting...';
    lucide.createIcons();
    
    try {
      const waNumber = document.getElementById('pay-whatsapp').value;
      const tid = document.getElementById('pay-tid').value;
      const fileInput = document.getElementById('pay-receipt');
      const file = fileInput.files[0];

      // Upload receipt
      const uploadedFile = await storage.createFile('payment-receipts', ID.unique(), file);

      // Create record
      await databases.createDocument(CONFIG.databaseId, COLS.paymentReceipts, ID.unique(), {
        userId: currentUser.$id,
        requestId: ID.unique(),
        paymentMethod: 'JazzCash/EasyPaisa - ' + waNumber + ' - TID: ' + tid,
        receiptImageId: uploadedFile.$id,
        amount: 750,
        requestStatus: 'pending'
      });

      document.getElementById('premium-payment-form').style.display = 'none';
      document.getElementById('payment-status-message').style.display = 'block';

    } catch (error) {
      console.error(error);
      alert('Failed to submit payment. Please try again.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send"></i> Submit Payment Proof';
      lucide.createIcons();
    }
  });

  // Feedback Form
  document.getElementById('feedback-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-feedback-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      await databases.createDocument(CONFIG.databaseId, COLS.supportTickets, ID.unique(), {
        userId: currentUser.$id,
        category: document.getElementById('feedback-category').value,
        subject: document.getElementById('feedback-subject').value,
        message: document.getElementById('feedback-message').value,
        status: 'open',
        dateTimeReceived: new Date().toISOString()
      });
      alert('Feedback sent successfully!');
      e.target.reset();
    } catch (err) {
      console.error(err);
      alert('Error sending feedback');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send"></i> Send Feedback';
      lucide.createIcons();
    }
  });
}

// --- Data Fetching ---

async function loadResources() {
  const container = document.getElementById('resources-grid');
  container.innerHTML = '<p>Loading resources for ' + currentUni + '...</p>';
  
  try {
    const queries = [Query.equal('university', currentUni)];
    if (currentFilter !== 'All') {
      queries.push(Query.equal('resourceType', currentFilter));
    }
    
    const res = await databases.listDocuments(CONFIG.databaseId, COLS.resources, queries);
    
    // Update stats
    document.getElementById('stat-resources').textContent = res.total;

    container.innerHTML = '';
    if (res.documents.length === 0) {
      container.innerHTML = '<p style="color:var(--color-text-muted);">No resources found for this filter.</p>';
      return;
    }

    res.documents.forEach(item => {
      const card = document.createElement('div');
      card.className = 'course-card';
      
      let icon = 'file';
      if(item.resourceType === 'Video') icon = 'video';
      if(item.resourceType === 'PDF') icon = 'file-text';
      if(item.resourceType === 'Notes') icon = 'book';

      card.innerHTML = `
        <div class="cc-icon"><i data-lucide="${icon}"></i></div>
        <h4 style="margin-bottom:8px;">${item.title || 'Untitled Resource'}</h4>
        <p style="font-size:0.85rem; color:var(--color-text-muted); margin-bottom:16px; flex:1;">${item.description || 'No description available.'}</p>
        <button class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="window.open('${item.url}', '_blank')">Access Resource</button>
      `;
      container.appendChild(card);
    });
    lucide.createIcons();
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p>Error loading resources. Please try again.</p>';
  }
}

function loadPastPapersUnis() {
  const unis = ['NUST', 'FAST', 'GIKI', 'COMSATS', 'UET', 'ITU', 'PU'];
  const container = document.getElementById('past-papers-uni-grid');
  container.innerHTML = '';
  
  unis.forEach(uni => {
    const card = document.createElement('div');
    card.className = 'pp-card';
    card.innerHTML = `
      <img src="/assets/universities/${uni.toLowerCase()}.png" alt="${uni}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3135/3135768.png'">
      <h4>${uni}</h4>
      <p>Past Papers</p>
    `;
    card.addEventListener('click', () => openPastPapersModal(uni));
    container.appendChild(card);
  });
}

async function openPastPapersModal(uni) {
  document.getElementById('pp-list-modal').classList.add('active');
  document.getElementById('pp-list-title').textContent = `${uni} Past Papers`;
  const container = document.getElementById('pp-list-grid');
  container.innerHTML = '<p>Loading papers...</p>';
  
  try {
    const res = await databases.listDocuments(CONFIG.databaseId, COLS.pastPapers, [
      Query.equal('university', uni),
      Query.limit(50)
    ]);
    
    document.getElementById('stat-past-papers').textContent = res.total; // update stat just in case
    
    container.innerHTML = '';
    if(res.documents.length === 0) {
      container.innerHTML = '<p>No past papers found for ' + uni + '.</p>';
      return;
    }

    res.documents.forEach(paper => {
      const card = document.createElement('div');
      card.className = 'course-card';
      const isLocked = paper.premiumOnly && !isPremium;
      
      card.innerHTML = `
        <div class="cc-icon" style="background:${isLocked ? '#fee2e2' : '#e0f2fe'}; color:${isLocked ? '#ef4444' : '#0ea5e9'};">
          <i data-lucide="${isLocked ? 'lock' : 'file-text'}"></i>
        </div>
        <h4>${paper.title} ${paper.year ? `(${paper.year})` : ''}</h4>
        <p style="font-size:0.8rem; color:var(--color-text-muted);">${paper.description || 'Full past paper'}</p>
        <div style="margin-top:auto; padding-top:16px;">
          <button class="btn-primary" style="width:100%; padding:8px; font-size:0.85rem; background:${isLocked ? '#f59e0b' : 'var(--color-primary)'};">
            ${isLocked ? 'Premium Only' : 'View Paper'}
          </button>
        </div>
      `;
      
      card.querySelector('button').addEventListener('click', () => {
        openPdfPreview(paper.pdfFileId, paper.premiumOnly);
      });
      
      container.appendChild(card);
    });
    lucide.createIcons();
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p>Error loading papers.</p>';
  }
}

async function openPdfPreview(fileId, premiumOnly) {
  document.getElementById('pp-list-modal').classList.remove('active');
  const modal = document.getElementById('pdf-preview-modal');
  modal.classList.add('active');
  
  const iframe = document.getElementById('pdf-iframe');
  const lock = document.getElementById('pdf-premium-lock');
  
  if (premiumOnly && !isPremium) {
    iframe.src = '';
    lock.style.display = 'flex';
  } else {
    lock.style.display = 'none';
    try {
      const url = storage.getFileView('past-papers', fileId);
      iframe.src = url.href;
    } catch (e) {
      console.error(e);
      iframe.src = '';
      alert('Could not load PDF');
    }
  }
}

async function loadNotifications() {
  const container = document.getElementById('notifications-list');
  try {
    const res = await databases.listDocuments(CONFIG.databaseId, COLS.notifications, [
      Query.limit(10),
      Query.orderDesc('created_at')
    ]);
    
    if (res.documents.length > 0) {
      document.getElementById('notification-dot').classList.add('active');
    }
    
    container.innerHTML = '';
    res.documents.forEach(n => {
      const item = document.createElement('div');
      item.className = 'notification-item unread';
      item.innerHTML = `
        <div class="notif-icon"><i data-lucide="bell"></i></div>
        <div class="notif-content">
          <h4>${n.title}</h4>
          <p>${n.message}</p>
          <span class="notif-time">${new Date(n.created_at || Date.now()).toLocaleDateString()}</span>
        </div>
      `;
      item.addEventListener('click', () => { item.classList.remove('unread'); });
      container.appendChild(item);
    });
    lucide.createIcons();
  } catch (error) {
    console.error('Error notifications', error);
  }
}

async function loadMockTests() {
  const container = document.getElementById('mock-tests-grid');
  try {
    // If the collection doesn't exist yet, we catch the error gracefully
    const res = await databases.listDocuments(CONFIG.databaseId, COLS.mockTests, [
      Query.limit(20)
    ]).catch(() => ({documents:[], total:0}));
    
    document.getElementById('stat-mock-tests').textContent = res.total;
    
    if (res.documents.length === 0) {
      container.innerHTML = '<p>No mock tests available currently.</p>';
      return;
    }
    
    container.innerHTML = '';
    res.documents.forEach(test => {
      const card = document.createElement('div');
      card.className = 'course-card';
      const isLocked = test.premium_only && !isPremium;
      card.innerHTML = `
        <div class="cc-icon"><i data-lucide="${isLocked ? 'lock' : 'clipboard-list'}"></i></div>
        <h4>${test.title}</h4>
        <div class="cc-meta">
          <span><i data-lucide="clock" style="width:14px;"></i> ${test.duration_minutes || 60} mins</span>
          <span><i data-lucide="help-circle" style="width:14px;"></i> ${test.total_questions || '?'} MCQs</span>
        </div>
        <button class="btn-primary" style="margin-top:16px; padding:8px; font-size:0.85rem;" ${isLocked ? 'disabled' : ''}>
          ${isLocked ? 'Premium Only' : 'Start Test'}
        </button>
      `;
      container.appendChild(card);
    });
    lucide.createIcons();
  } catch (error) {
    console.error('Error mock tests', error);
    container.innerHTML = '<p>Failed to load mock tests.</p>';
  }
}

// Start
document.addEventListener('DOMContentLoaded', init);
