import React, { useState } from 'react';

const PrivacySettingsPage = () => {
    const [showProfile, setShowProfile] = useState(true);
    const [shareData, setShareData] = useState(true);

    return (
        <main className="legal-page"><div className="legal-page__content container mx-auto p-8">
            <h1 className="legal-page__title text-3xl font-bold mb-6">Privacy Settings</h1>
            <p className="mb-8">Manage your privacy settings to control how your information is used and shared.</p>

            <div className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                        <h2 className="text-lg font-semibold">Show my profile in Discover</h2>
                        <p className="text-sm text-gray-600">Allow other users to see your profile in the discovery queue.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={showProfile} onChange={() => setShowProfile(!showProfile)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                        <h2 className="text-lg font-semibold">Share usage data for analytics</h2>
                        <p className="text-sm text-gray-600">Help us improve our service by allowing us to collect anonymous usage data.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={shareData} onChange={() => setShareData(!shareData)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                </div>
            </div>
        </div></main>
    );
};

export default PrivacySettingsPage;
