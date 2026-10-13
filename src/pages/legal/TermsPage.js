import React from 'react';

const TermsPage = () => {
    return (
        <div className="container mx-auto p-8">
            <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
            <p>Welcome to our dating app. By using our service, you agree to these terms. Please read them carefully.</p>

            <div className="prose mt-4">
                <h2>1. Acceptance of Terms</h2>
                <p>By accessing or using our service, you confirm that you can form a binding contract with us, that you accept these Terms and that you agree to comply with them.</p>

                <h2>2. Eligibility</h2>
                <p>You must be at least 18 years old to use our service. By creating an account, you represent and warrant that you are at least 18 years old.</p>

                <h2>3. User Conduct</h2>
                <p>You agree not to use the service to post or send any content that is abusive, harassing, defamatory, or obscene. We reserve the right to terminate accounts that violate our community guidelines.</p>

                <h2>4. Payments</h2>
                <p>Certain features of the service may be subject to payments now or in the future. All one-time payments are final and non-refundable.</p>

                <h2>5. Disclaimer of Warranties</h2>
                <p>The service is provided "as is" without any warranties of any kind. We do not guarantee that the service will always be safe, secure, or error-free.</p>
            </div>
        </div>
    );
};

export default TermsPage;
