'use client';

import { useAuth } from 'ui/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // This effect demonstrates how you might guard a route.
    if (!loading && !user) {
      // If loading is finished and there's no user,
      // you would typically redirect to a login page.
      console.log('Not authenticated. Redirecting to login/home...');
      // Example: router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div>Loading authentication status...</div>;
  }

  // Placeholder for the age gate functionality as requested
  const handleAgeGate = () => {
    alert('Age verification logic would be implemented here.');
  };

  return (
    <main>
      <h1>Onboarding</h1>
      <p>To continue, please verify you are 18 or older.</p>

      <div style={{ marginTop: '2rem', border: '1px solid #ccc', padding: '1rem' }}>
        <h2>Age Gate</h2>
        <p>Are you at least 18 years old?</p>
        <button onClick={handleAgeGate}>Yes, I am 18 or older</button>
      </div>
    </main>
  );
}
