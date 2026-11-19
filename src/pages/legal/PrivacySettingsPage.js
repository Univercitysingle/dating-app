import React, { useState } from 'react';
import apiClient from '../../api/apiClient';

const PrivacySettingsPage = () => {
    const [showProfile, setShowProfile] = useState(true);
    const [shareData, setShareData] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [exportMessage, setExportMessage] = useState('');

    const handleExport = async () => {
        if (exporting) return;
        setExporting(true);
        setExportMessage('');
        try {
            const blob = await apiClient.get('/users/me/export', { responseType: 'blob' });
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = 'dating-app-account-data.json';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(objectUrl);
            setExportMessage('Your account data export has been prepared. Check your downloads.');
        } catch (error) {
            setExportMessage(error?.message || 'Unable to prepare your account data export. Please try again later.');
        } finally {
            setExporting(false);
        }
    };

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

            <section className="mt-10 rounded-xl border p-5" aria-labelledby="account-data-export-title">
                <h2 id="account-data-export-title" className="text-lg font-semibold">Your account data</h2>
                <p className="mt-2 text-sm text-gray-600">
                    Download a JSON copy of your profile, matches, conversations, purchases, subscriptions, and customer-visible support ticket messages.
                    Passwords, authentication credentials, biometric evidence, operational IP addresses, and internal support notes are excluded.
                </p>
                <button
                    type="button"
                    onClick={handleExport}
                    disabled={exporting}
                    className="mt-4 rounded-lg bg-primary px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {exporting ? 'Preparing export…' : 'Download my account data'}
                </button>
                <p className="mt-2 text-xs text-gray-500">For security, account exports are limited to one request every 24 hours.</p>
                {exportMessage && <p className="mt-3 text-sm" role="status" aria-live="polite">{exportMessage}</p>}
            </section>
        </div></main>
    );
};

export default PrivacySettingsPage;
