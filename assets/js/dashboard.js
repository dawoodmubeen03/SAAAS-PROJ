// Appwrite Configuration
const CONFIG = {
  endpoint: 'https://sgp.cloud.appwrite.io/v1',
  projectId: '6a11e2ba00082db8f17a',
  databaseId: '6a1314730019b5dc83aa'
};

let appwrite;
let client;
let account;
let databases;
let storage;
let currentUser = null;
let unreadNotificationsCount = 0;

// Initialize Appwrite
async function initAppwrite() {
  const { Client, Account, Databases, Storage } = await import('https://cdn.jsdelivr.net/npm/appwrite/+esm');
  
  client = new Client();
  client.setEndpoint(CONFIG.endpoint).setProject(CONFIG.projectId);
  
  account = new Account(client);
  databases = new Databases(client);
  storage = new Storage(client);
  
  appwrite = { Client, Account, Databases, Storage };
}

// Auth Manager
class AuthManager {
  static async checkSession() {
    try {
      const session = await account.getSession('current');
      const user = await account.get();
      currentUser = user;
      
      // Fetch user document
      const users = await databases.listDocuments(
        CONFIG.databaseId,
        'users',
        [Query.equal('userId', user.$id)]
      );
      
      if (users.documents.length > 0) {
        currentUser = { ...currentUser, ...users.documents[0] };
      }
      
      return user;
    } catch (error) {
      window.location.href = 'login.html';
      return null;
    }
  }

  static async logout() {
    try {
      await account.deleteSession('current');
      window.location.href = 'login.html';
    } catch (error) {
      showToast('Logout failed', 'error');
    }
  }
}

// Dashboard Manager
class DashboardManager {
  static async loadDashboard() {
    try {
      showPage('home');
      await this.loadStats();
      await this.displayWelcome();
    } catch (error) {
      showToast('Failed to load dashboard', 'error');
    }
  }

  static async loadStats() {
    try {
      // Load mock test attempts
      const mockAttempts = await databases.listDocuments(
        CONFIG.databaseId,
        'mock_attempts',
        [Query.equal('userId', currentUser.$id)]
      );
      
      // Load past papers
      const pastPapers = await databases.listDocuments(
        CONFIG.databaseId,
        'past_papers'
      );
      
      // Load resources
      const resources = await databases.listDocuments(
        CONFIG.databaseId,
        'resources'
      );

      const statsData = {
        mockTests: mockAttempts.total || 0,
        pastPapers: pastPapers.total || 0,
        resources: resources.total || 0,
        isPremium: currentUser.isPremium || false
      };

      updateStatsCards(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  static async displayWelcome() {
    const welcomeCard = document.querySelector('.welcome-card');
    if (welcomeCard) {
      const name = currentUser.name || 'User';
      const university = currentUser.university || 'Not selected';
      const isPremium = currentUser.isPremium ? 'Premium' : 'Free';
      
      welcomeCard.innerHTML = `
        <div class="welcome-content">
          <h2>Welcome back, ${name} 👋</h2>
          <p>University: <strong>${university}</strong></p>
          <p>Status: <strong>${isPremium}</strong></p>
        </div>
      `;
    }
  }
}

// Resource Manager
class ResourceManager {
  static async loadResources() {
    try {
      showPage('resources');
      const resources = await databases.listDocuments(
        CONFIG.databaseId,
        'resources'
      );
      
      this.displayResources(resources.documents);
      this.setupFilters();
    } catch (error) {
      showToast('Failed to load resources', 'error');
    }
  }

  static displayResources(resources) {
    const container = document.querySelector('.resources-grid');
    if (!container) return;

    container.innerHTML = '';
    
    resources.forEach(resource => {
      const isLocked = resource.premiumOnly && !currentUser.isPremium;
      const card = document.createElement('div');
      card.className = 'resource-card';
      
      let preview = '';
      if (resource.resourceType === 'Video') {
        preview = `<div class="resource-preview video-preview">▶ Video</div>`;
      } else if (resource.resourceType === 'PDF') {
        preview = `<div class="resource-preview pdf-preview">📄 PDF</div>`;
      } else {
        preview = `<div class="resource-preview link-preview">🔗 Link</div>`;
      }

      card.innerHTML = `
        ${preview}
        <div class="resource-info">
          <h3>${resource.title}</h3>
          <p>${resource.description || 'No description'}</p>
          <div class="resource-meta">
            <span class="university-badge">${resource.university}</span>
            ${isLocked ? '<span class="premium-badge">🔒 Premium</span>' : '<span class="free-badge">Free</span>'}
          </div>
        </div>
      `;

      if (isLocked) {
        card.classList.add('locked');
        card.addEventListener('click', () => showPage('premium'));
      } else {
        card.addEventListener('click', () => this.openResource(resource));
      }

      container.appendChild(card);
    });
  }

  static openResource(resource) {
    const modal = document.getElementById('contentModal');
    const title = modal.querySelector('.modal-title');
    const body = modal.querySelector('.modal-body');

    title.textContent = resource.title;
    
    if (resource.resourceType === 'Video') {
      body.innerHTML = `
        <div class="video-container">
          <iframe width="100%" height="400" src="${resource.url}" frameborder="0" allowfullscreen></iframe>
        </div>
      `;
    } else if (resource.resourceType === 'PDF') {
      body.innerHTML = `
        <div class="pdf-container">
          <embed src="${resource.url}" type="application/pdf" width="100%" height="600">
          <div class="pdf-actions">
            <a href="${resource.url}" download class="btn btn-primary">Download PDF</a>
          </div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="link-container">
          <p>External Link: <a href="${resource.url}" target="_blank">${resource.url}</a></p>
          <a href="${resource.url}" target="_blank" class="btn btn-primary">Open Link</a>
        </div>
      `;
    }

    openModal();
  }

  static setupFilters() {
    const searchInput = document.querySelector('.resource-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.filterResources(e.target.value));
    }
  }

  static async filterResources(searchTerm) {
    try {
      let query = [];
      if (searchTerm) {
        query.push(Query.search('title', searchTerm));
      }

      const resources = await databases.listDocuments(
        CONFIG.databaseId,
        'resources',
        query
      );
      
      this.displayResources(resources.documents);
    } catch (error) {
      console.error('Error filtering resources:', error);
    }
  }
}

// Mock Tests Manager
class MockTestManager {
  static async loadMockTests() {
    try {
      showPage('mock-tests');
      const tests = await databases.listDocuments(
        CONFIG.databaseId,
        'mock_tests'
      );
      
      this.displayTests(tests.documents);
    } catch (error) {
      showToast('Failed to load mock tests', 'error');
    }
  }

  static displayTests(tests) {
    const container = document.querySelector('.mock-tests-grid');
    if (!container) return;

    container.innerHTML = '';
    
    tests.forEach(test => {
      const isLocked = test.premium_only && !currentUser.isPremium;
      const card = document.createElement('div');
      card.className = 'test-card';
      
      card.innerHTML = `
        <div class="test-header">
          <h3>${test.title}</h3>
          ${isLocked ? '<span class="lock-icon">🔒</span>' : ''}
        </div>
        <div class="test-info">
          <p><strong>University:</strong> ${test.university}</p>
          <p><strong>Type:</strong> ${test.test_type}</p>
          <p><strong>Duration:</strong> ${test.duration_minutes} min</p>
          <p><strong>Passing Marks:</strong> ${test.passing_marks}</p>
        </div>
        <p class="test-description">${test.description}</p>
      `;

      if (isLocked) {
        card.classList.add('locked');
        card.addEventListener('click', () => showPage('premium'));
      } else {
        card.addEventListener('click', () => this.openTestModal(test));
      }

      container.appendChild(card);
    });
  }

  static openTestModal(test) {
    const modal = document.getElementById('contentModal');
    const title = modal.querySelector('.modal-title');
    const body = modal.querySelector('.modal-body');

    title.textContent = test.title;
    body.innerHTML = `
      <div class="test-details">
        <h3>Test Details</h3>
        <p><strong>University:</strong> ${test.university}</p>
        <p><strong>Type:</strong> ${test.test_type}</p>
        <p><strong>Duration:</strong> ${test.duration_minutes} minutes</p>
        <p><strong>Passing Marks:</strong> ${test.passing_marks}</p>
        <p><strong>Negative Marking:</strong> ${test.negative_marking ? 'Yes' : 'No'}</p>
        <p>${test.description}</p>
        <button class="btn btn-primary" onclick="startTest('${test.$id}')">Start Test</button>
      </div>
    `;

    openModal();
  }
}

// Past Papers Manager
class PastPapersManager {
  static async loadPastPapers() {
    try {
      showPage('past-papers');
      await this.displayUniversities();
    } catch (error) {
      showToast('Failed to load past papers', 'error');
    }
  }

  static async displayUniversities() {
    const universities = ['NUST', 'FAST', 'GIKI', 'UET', 'COMSATS', 'MDCAT', 'ECAT'];
    const container = document.querySelector('.universities-grid');
    if (!container) return;

    container.innerHTML = '';
    
    universities.forEach(uni => {
      const card = document.createElement('div');
      card.className = 'university-card';
      card.innerHTML = `
        <div class="uni-logo">
          <img src="assets/universities/${uni.toLowerCase()}.png" alt="${uni}" onerror="this.src='https://via.placeholder.com/80'">
        </div>
        <h3>${uni}</h3>
        <p>Click to view past papers</p>
      `;

      card.addEventListener('click', () => this.showUniversityPapers(uni));
      container.appendChild(card);
    });
  }

  static async showUniversityPapers(university) {
    try {
      const papers = await databases.listDocuments(
        CONFIG.databaseId,
        'past_papers',
        [Query.equal('university', university)]
      );

      const modal = document.getElementById('contentModal');
      const title = modal.querySelector('.modal-title');
      const body = modal.querySelector('.modal-body');

      title.textContent = `${university} - Past Papers`;
      
      body.innerHTML = '';
      papers.documents.forEach(paper => {
        const isLocked = paper.premiumOnly && !currentUser.isPremium;
        const paperDiv = document.createElement('div');
        paperDiv.className = `past-paper-item ${isLocked ? 'locked' : ''}`;
        
        paperDiv.innerHTML = `
          <h4>${paper.title}</h4>
          <p><strong>Year:</strong> ${paper.year}</p>
          <p><strong>Category:</strong> ${paper.category}</p>
          ${isLocked ? '<span class="lock-icon">🔒 Premium</span>' : ''}
        `;

        if (isLocked) {
          paperDiv.addEventListener('click', () => showPage('premium'));
        } else {
          paperDiv.addEventListener('click', () => this.viewPaperPDF(paper));
        }

        body.appendChild(paperDiv);
      });

      openModal();
    } catch (error) {
      showToast('Failed to load past papers', 'error');
    }
  }

  static viewPaperPDF(paper) {
    const modal = document.getElementById('contentModal');
    const body = modal.querySelector('.modal-body');

    body.innerHTML = `
      <div class="pdf-viewer">
        <embed src="data:application/pdf;base64,..." type="application/pdf" width="100%" height="600">
        <div class="pdf-actions">
          <button class="btn btn-primary" onclick="downloadPDF('${paper.pdfFileId}')">Download PDF</button>
        </div>
      </div>
    `;
  }
}

// Notification Manager
class NotificationManager {
  static async loadNotifications() {
    try {
      const notifications = await databases.listDocuments(
        CONFIG.databaseId,
        'notifications'
      );

      const announcements = await databases.listDocuments(
        CONFIG.databaseId,
        'announcements'
      );

      const allNotifications = [...notifications.documents, ...announcements.documents];
      
      showPage('notifications');
      this.displayNotifications(allNotifications);
      
      await this.updateUnreadCount();
    } catch (error) {
      showToast('Failed to load notifications', 'error');
    }
  }

  static displayNotifications(notifications) {
    const container = document.querySelector('.notifications-list');
    if (!container) return;

    container.innerHTML = '';
    
    notifications.forEach(notif => {
      const notifDiv = document.createElement('div');
      notifDiv.className = `notification-item ${notif.read ? '' : 'unread'}`;
      
      notifDiv.innerHTML = `
        <div class="notif-content">
          <h4>${notif.title}</h4>
          <p>${notif.message}</p>
          <small>${new Date(notif.$createdAt).toLocaleDateString()}</small>
        </div>
      `;

      if (!notif.read) {
        notifDiv.addEventListener('click', () => this.markAsRead(notif.$id));
      }

      container.appendChild(notifDiv);
    });
  }

  static async markAsRead(notifId) {
    try {
      await databases.updateDocument(
        CONFIG.databaseId,
        'notifications',
        notifId,
        { read: true }
      );

      await this.updateUnreadCount();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  static async updateUnreadCount() {
    try {
      const unread = await databases.listDocuments(
        CONFIG.databaseId,
        'notifications',
        [Query.equal('read', false), Query.equal('userId', currentUser.$id)]
      );

      unreadNotificationsCount = unread.total;
      const badge = document.querySelector('.notif-badge');
      if (badge) {
        badge.style.display = unreadNotificationsCount > 0 ? 'block' : 'none';
      }
    } catch (error) {
      console.error('Error updating unread count:', error);
    }
  }
}

// Premium Manager
class PremiumManager {
  static async loadPremiumPage() {
    try {
      showPage('premium');
      this.displayPricingCard();
    } catch (error) {
      showToast('Failed to load premium page', 'error');
    }
  }

  static displayPricingCard() {
    const container = document.querySelector('.premium-pricing');
    if (container) {
      container.innerHTML = `
        <div class="pricing-card premium">
          <div class="pricing-header">
            <h2>Lifetime Premium</h2>
            <span class="pricing-tag">One Time Payment</span>
          </div>
          <div class="pricing-body">
            <div class="price">Rs. 750</div>
            <ul class="features-list">
              <li>✓ Premium Past Papers</li>
              <li>✓ Premium Resources</li>
              <li>✓ Premium Mock Tests</li>
              <li>✓ Full Access</li>
              <li>✓ Unlimited Usage</li>
            </ul>
          </div>
          <button class="btn btn-primary" onclick="openPaymentForm()">Subscribe Now</button>
        </div>
      `;
    }

    this.displayPaymentSection();
  }

  static displayPaymentSection() {
    const container = document.querySelector('.payment-section');
    if (container) {
      container.innerHTML = `
        <div class="payment-card">
          <h3>Payment Method</h3>
          <div class="payment-info">
            <div class="payment-method">
              <p><strong>JazzCash Number:</strong> 03XX-XXXXXXX</p>
              <button class="btn-copy" onclick="copyToClipboard('03XX-XXXXXXX')">Copy</button>
            </div>
            <div class="payment-method">
              <p><strong>Account Title:</strong> FUNGEP</p>
              <button class="btn-copy" onclick="copyToClipboard('FUNGEP')">Copy</button>
            </div>
          </div>

          <div class="receipt-upload">
            <h4>Upload Receipt</h4>
            <form id="paymentForm">
              <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="fullName" required>
              </div>
              <div class="form-group">
                <label>WhatsApp Number</label>
                <input type="tel" id="whatsappNumber" required>
              </div>
              <div class="form-group">
                <label>Transaction ID</label>
                <input type="text" id="transactionId" required>
              </div>
              <div class="form-group">
                <label>Receipt Image</label>
                <input type="file" id="receiptImage" accept="image/*" required>
              </div>
              <button type="submit" class="btn btn-primary">Submit Payment Request</button>
            </form>
          </div>
        </div>
      `;

      document.getElementById('paymentForm')?.addEventListener('submit', 
        (e) => this.submitPayment(e));
    }
  }

  static async submitPayment(e) {
    e.preventDefault();
    
    try {
      const fullName = document.getElementById('fullName').value;
      const whatsappNumber = document.getElementById('whatsappNumber').value;
      const transactionId = document.getElementById('transactionId').value;
      const receiptImage = document.getElementById('receiptImage').files[0];

      // Upload receipt image
      const fileResponse = await storage.createFile(
        'payment-receipts',
        'unique()',
        receiptImage
      );

      // Create payment request
      await databases.createDocument(
        CONFIG.databaseId,
        'payment_requests',
        'unique()',
        {
          userId: currentUser.$id,
          fullName,
          whatsappNumber,
          transactionId,
          receiptImageId: fileResponse.$id,
          paymentMethod: 'JazzCash',
          amount: 750,
          requestStatus: 'pending',
          dateSubmitted: new Date().toISOString()
        }
      );

      showToast('Payment request submitted successfully!', 'success');
      document.getElementById('paymentForm').reset();
    } catch (error) {
      showToast('Failed to submit payment request', 'error');
    }
  }
}

// Profile Manager
class ProfileManager {
  static async loadProfile() {
    try {
      showPage('profile');
      this.displayProfile();
    } catch (error) {
      showToast('Failed to load profile', 'error');
    }
  }

  static displayProfile() {
    const container = document.querySelector('.profile-content');
    if (container) {
      container.innerHTML = `
        <div class="profile-card">
          <div class="profile-header">
            <img id="profileImage" src="${this.getProfileImageUrl()}" alt="Profile" class="profile-pic">
            <div class="profile-details">
              <h2>${currentUser.name}</h2>
              <p>${currentUser.email}</p>
              <p class="premium-status">${currentUser.isPremium ? '✓ Premium Member' : 'Free Member'}</p>
            </div>
          </div>

          <div class="profile-info">
            <div class="info-group">
              <label>University Target</label>
              <p>${currentUser.university || 'Not selected'}</p>
            </div>
            <div class="info-group">
              <label>Test Type</label>
              <p>${currentUser.testType || 'Not selected'}</p>
            </div>
            <div class="info-group">
              <label>Batch</label>
              <p>${currentUser.batch || 'Not selected'}</p>
            </div>
          </div>

          <div class="profile-actions">
            <div class="form-group">
              <label>Update Profile Picture</label>
              <input type="file" id="profileImageInput" accept="image/*" onchange="uploadProfileImage(this.files[0])">
            </div>
          </div>
        </div>
      `;
    }
  }

  static getProfileImageUrl() {
    if (currentUser.profileImageId) {
      return storage.getFilePreview('profile-images', currentUser.profileImageId);
    }
    return 'https://via.placeholder.com/100/00adef/ffffff?text=User';
  }

  static async uploadProfileImage(file) {
    try {
      const fileResponse = await storage.createFile(
        'profile-images',
        'unique()',
        file
      );

      await databases.updateDocument(
        CONFIG.databaseId,
        'users',
        currentUser.$id,
        { profileImageId: fileResponse.$id }
      );

      currentUser.profileImageId = fileResponse.$id;
      this.displayProfile();
      showToast('Profile picture updated successfully!', 'success');
    } catch (error) {
      showToast('Failed to upload profile picture', 'error');
    }
  }
}

// Feedback Manager
class FeedbackManager {
  static async loadFeedback() {
    try {
      showPage('feedback');
      this.displayFeedbackForm();
      await this.loadFeedbackHistory();
    } catch (error) {
      showToast('Failed to load feedback page', 'error');
    }
  }

  static displayFeedbackForm() {
    const container = document.querySelector('.feedback-form-container');
    if (container) {
      container.innerHTML = `
        <form id="feedbackForm" class="feedback-form">
          <div class="form-group">
            <label>Category</label>
            <select id="feedbackCategory" required>
              <option>Bug Report</option>
              <option>Feature Request</option>
              <option>General Feedback</option>
              <option>Complaint</option>
            </select>
          </div>
          <div class="form-group">
            <label>Subject</label>
            <input type="text" id="feedbackSubject" required>
          </div>
          <div class="form-group">
            <label>Message</label>
            <textarea id="feedbackMessage" rows="5" required></textarea>
          </div>
          <button type="submit" class="btn btn-primary">Submit Feedback</button>
        </form>
      `;

      document.getElementById('feedbackForm')?.addEventListener('submit', 
        (e) => this.submitFeedback(e));
    }
  }

  static async submitFeedback(e) {
    e.preventDefault();

    try {
      const category = document.getElementById('feedbackCategory').value;
      const subject = document.getElementById('feedbackSubject').value;
      const message = document.getElementById('feedbackMessage').value;

      await databases.createDocument(
        CONFIG.databaseId,
        'feedback',
        'unique()',
        {
          userId: currentUser.$id,
          category,
          subject,
          message,
          status: 'pending',
          dateTimeReceived: new Date().toISOString()
        }
      );

      showToast('Feedback submitted successfully!', 'success');
      document.getElementById('feedbackForm').reset();
      await this.loadFeedbackHistory();
    } catch (error) {
      showToast('Failed to submit feedback', 'error');
    }
  }

  static async loadFeedbackHistory() {
    try {
      const feedback = await databases.listDocuments(
        CONFIG.databaseId,
        'feedback',
        [Query.equal('userId', currentUser.$id)]
      );

      const container = document.querySelector('.feedback-history');
      if (container) {
        container.innerHTML = '';
        feedback.documents.forEach(item => {
          const div = document.createElement('div');
          div.className = `feedback-item ${item.status}`;
          div.innerHTML = `
            <h4>${item.subject}</h4>
            <p class="category">${item.category}</p>
            <p>${item.message}</p>
            <small>${item.status.toUpperCase()} - ${new Date(item.dateTimeReceived).toLocaleDateString()}</small>
          `;
          container.appendChild(div);
        });
      }
    } catch (error) {
      console.error('Error loading feedback history:', error);
    }
  }
}

// UI Helpers
function showPage(pageName) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(`${pageName}-page`)?.classList.add('active');
  
  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-page="${pageName}"]`)?.classList.add('active');
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.classList.toggle('collapsed');
}

function openModal() {
  document.getElementById('contentModal').classList.add('active');
}

function closeModal() {
  document.getElementById('contentModal').classList.remove('active');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showToast('Copied to clipboard!', 'success');
}

function updateStatsCards(data) {
  document.querySelector('[data-stat="mock-tests"] .stat-value').textContent = data.mockTests;
  document.querySelector('[data-stat="past-papers"] .stat-value').textContent = data.pastPapers;
  document.querySelector('[data-stat="resources"] .stat-value').textContent = data.resources;
  document.querySelector('[data-stat="premium"] .stat-value').textContent = data.isPremium ? 'Premium' : 'Free';
}

// Event Listeners Setup
function setupEventListeners() {
  document.getElementById('hamburgerMenu').addEventListener('click', toggleSidebar);
  
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      
      switch(page) {
        case 'home':
          DashboardManager.loadDashboard();
          break;
        case 'resources':
          ResourceManager.loadResources();
          break;
        case 'mock-tests':
          MockTestManager.loadMockTests();
          break;
        case 'past-papers':
          PastPapersManager.loadPastPapers();
          break;
        case 'premium':
          PremiumManager.loadPremiumPage();
          break;
        case 'notifications':
          NotificationManager.loadNotifications();
          break;
        case 'profile':
          ProfileManager.loadProfile();
          break;
        case 'feedback':
          FeedbackManager.loadFeedback();
          break;
        case 'logout':
          AuthManager.logout();
          break;
      }
    });
  });

  const notificationBell = document.getElementById('notificationBell');
  if (notificationBell) {
    notificationBell.addEventListener('click', () => {
      NotificationManager.loadNotifications();
    });
  }

  const profileImage = document.getElementById('headerProfileImage');
  if (profileImage) {
    profileImage.addEventListener('click', () => {
      ProfileManager.loadProfile();
    });
  }

  document.getElementById('contentModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'contentModal') {
      closeModal();
    }
  });

  document.querySelector('.modal-close')?.addEventListener('click', closeModal);
}

// Initialize Dashboard
async function initDashboard() {
  try {
    await initAppwrite();
    const user = await AuthManager.checkSession();
    
    if (user) {
      setupEventListeners();
      DashboardManager.loadDashboard();
      NotificationManager.updateUnreadCount();
      
      // Update profile image in header
      const headerImage = document.getElementById('headerProfileImage');
      if (headerImage && currentUser.profileImageId) {
        headerImage.src = storage.getFilePreview('profile-images', currentUser.profileImageId);
      }
    }
  } catch (error) {
    console.error('Dashboard initialization error:', error);
  }
}

// Start dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);
