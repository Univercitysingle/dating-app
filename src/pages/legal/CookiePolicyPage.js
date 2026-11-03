import React from 'react';

const CookiePolicyPage = () => {
    return (
        <main className="legal-page"><div className="legal-page__content container mx-auto p-8">
            <h1 className="legal-page__title text-3xl font-bold mb-6">Cookie Policy</h1>
            <p>This page explains how we use cookies and similar technologies to help us ensure that our services function properly, prevent fraud and other harm, and analyze and improve the services in accordance with our Privacy Policy.</p>

            <div className="prose mt-4">
                <h2>1. What are cookies?</h2>
                <p>Cookies are small text files stored on your browser or device by websites, apps, online media, and advertisements. They are used to remember your browser or device during and across website visits.</p>

                <h2>2. How we use cookies</h2>
                <p>We use cookies for several purposes, such as:</p>
                <ul>
                    <li>Authenticating users</li>
                    <li>Remembering user preferences and settings</li>
                    <li>Determining the popularity of content</li>
                    <li>Delivering and measuring the effectiveness of advertising campaigns</li>
                    <li>Analyzing site traffic and trends</li>
                </ul>

                <h2>3. Your choices</h2>
                <p>You have the right to choose whether or not to accept cookies. However, they are an important part of how our services work, so you should be aware that if you choose to refuse or remove cookies, this could affect the availability and functionality of the services.</p>
            </div>
        </div></main>
    );
};

export default CookiePolicyPage;
