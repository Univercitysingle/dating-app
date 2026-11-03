import React from 'react';

const FAQPage = () => {
    return (
        <main className="legal-page"><div className="legal-page__content container mx-auto p-8">
            <h1 className="legal-page__title text-3xl font-bold mb-6">Frequently Asked Questions</h1>

            <div className="space-y-4">
                <div>
                    <h2 className="legal-page__section-title text-xl font-semibold">What is this app?</h2>
                    <p>This is a dating application designed to help you connect with new people.</p>
                </div>
                <div>
                    <h2 className="legal-page__section-title text-xl font-semibold">How does the matching work?</h2>
                    <p>Our algorithm uses your profile information and preferences to suggest potential matches.</p>
                </div>
                <div>
                    <h2 className="legal-page__section-title text-xl font-semibold">Is my data safe?</h2>
                    <p>We take your privacy and security very seriously. Please see our Privacy Policy for more details.</p>
                </div>
            </div>
        </div></main>
    );
};

export default FAQPage;
