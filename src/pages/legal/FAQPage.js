import React from 'react';

const FAQPage = () => {
    return (
        <div className="container mx-auto p-8">
            <h1 className="text-3xl font-bold mb-6">Frequently Asked Questions</h1>

            <div className="space-y-4">
                <div>
                    <h2 className="text-xl font-semibold">What is this app?</h2>
                    <p>This is a dating application designed to help you connect with new people.</p>
                </div>
                <div>
                    <h2 className="text-xl font-semibold">How does the matching work?</h2>
                    <p>Our algorithm uses your profile information and preferences to suggest potential matches.</p>
                </div>
                <div>
                    <h2 className="text-xl font-semibold">Is my data safe?</h2>
                    <p>We take your privacy and security very seriously. Please see our Privacy Policy for more details.</p>
                </div>
            </div>
        </div>
    );
};

export default FAQPage;
