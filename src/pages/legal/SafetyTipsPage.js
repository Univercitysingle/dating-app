import React from 'react';

const SafetyTipsPage = () => {
    return (
        <main className="legal-page"><div className="legal-page__content container mx-auto p-8">
            <h1 className="legal-page__title text-3xl font-bold mb-6">Online Dating Safety Tips</h1>

            <ul className="list-disc list-inside space-y-4">
                <li>
                    <strong>Protect Your Personal Information:</strong> Be careful about sharing personal details like your full name, address, phone number, or place of work too early.
                </li>
                <li>
                    <strong>Stay on the Platform:</strong> Keep conversations on the dating app's messaging platform while you're getting to know someone. Scammers often try to move the conversation to text, messaging apps, or phone right away.
                </li>
                <li>
                    <strong>Meet in Public:</strong> For your first few dates, meet in a public place where there are other people around. Never meet at your home, their home, or any other private location.
                </li>
                <li>
                    <strong>Tell a Friend:</strong> Inform a friend or family member of your plans. Tell them who you are meeting, where you are going, and when you expect to be back.
                </li>
                <li>
                    <strong>Trust Your Instincts:</strong> If something feels off, it probably is. Don't feel bad about cutting a date short or blocking someone if you feel uncomfortable or unsafe.
                </li>
            </ul>
        </div></main>
    );
};

export default SafetyTipsPage;
