document.addEventListener('DOMContentLoaded', () => {
    // Animasyon efektleri
    animatePostCards();
    
    // Post card click handler
    const postCards = document.querySelectorAll('.post-card');
    const accessModal = document.getElementById('accessModal');
    const closeButton = document.querySelector('.close-button');
    const postIdInput = document.getElementById('postIdInput');
    const accessForm = document.getElementById('accessForm');
    const errorMessage = document.getElementById('errorMessage');
    const accessCodeInput = document.getElementById('accessCodeInput');
    
    // Gönderi kartlarına animasyon ekle
    function animatePostCards() {
        const cards = document.querySelectorAll('.post-card');
        
        cards.forEach((card, index) => {
            // Başlangıçta kartları gizle
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';
            
            // Sırayla kartları göster
            setTimeout(() => {
                card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 100 + (index * 150));
            
            // Hover efekti için özel sınıf ekle
            card.classList.add('animated-card');
        });
    }

    // Open modal when clicking on a post card
    postCards.forEach(card => {
        card.addEventListener('click', () => {
            const postId = card.dataset.postId;
            const postTitle = card.querySelector('.post-card-title').textContent;
            
            if (postId) {
                // Set the post ID in the hidden input
                postIdInput.value = postId;
                
                // Show the modal
                accessModal.style.display = 'block';
                
                // Clear previous error messages and input
                errorMessage.textContent = '';
                accessCodeInput.value = '';
                
                // Focus on the input field
                accessCodeInput.focus();
            }
        });
    });

    // Close modal when clicking the close button
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            accessModal.style.display = 'none';
        });
    }

    // Close modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === accessModal) {
            accessModal.style.display = 'none';
        }
    });

    // Handle form submission
    if (accessForm) {
        accessForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const postId = postIdInput.value;
            const accessCode = accessCodeInput.value;

            try {
                const response = await fetch('/verify-access', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ postId, accessCode }),
                });

                const data = await response.json();

                if (data.success) {
                    window.location.href = data.redirectUrl;
                } else {
                    errorMessage.textContent = data.message || 'Geçersiz erişim kodu.';
                }
            } catch (error) {
                console.error('Error:', error);
                errorMessage.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
            }
        });
    }
});