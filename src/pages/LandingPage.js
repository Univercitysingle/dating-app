import React from 'react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

const faqs = [
  {
    question: 'What is Hart2Hart?',
    answer:
      'Hart2Hart is an online dating platform for adults aged 18 and over. Members can create a profile, discover other profiles, express interest and start conversations when interest is mutual.',
  },
  {
    question: 'How do I join Hart2Hart?',
    answer:
      'Select Create your account, complete the registration process and build your profile. You can then explore the Discover experience and choose who you would like to connect with.',
  },
  {
    question: 'Can I use Hart2Hart from my country?',
    answer:
      'Hart2Hart is a web-based service. Availability of particular features may depend on service coverage, local requirements and supported functionality in your region.',
  },
  {
    question: 'How can I communicate with a match?',
    answer:
      'Members can use private conversations to get to know people they connect with. Video communication may be available where supported.',
  },
  {
    question: 'Is Hart2Hart for people under 18?',
    answer:
      'No. Hart2Hart is intended for adults aged 18 and over. People under 18 must not create an account or use the service.',
  },
  {
    question: 'How do I stay safe when meeting someone online?',
    answer:
      'Protect your personal information, take time to get to know people, use the platform reporting and blocking tools when needed, and arrange first in-person meetings in a public place.',
  },
];

function LandingPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': 'https://dating-app-staging.pages.dev/#webpage',
        url: 'https://dating-app-staging.pages.dev/',
        name: 'Hart2Hart | Online Dating and Genuine Connections',
        description:
          'Discover profiles, connect through mutual interest and start meaningful conversations on Hart2Hart, an online dating platform for adults.',
        isPartOf: { '@id': 'https://dating-app-staging.pages.dev/#website' },
        about: { '@id': 'https://dating-app-staging.pages.dev/#application' },
        inLanguage: 'en',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://dating-app-staging.pages.dev/#website',
        name: 'Hart2Hart',
        url: 'https://dating-app-staging.pages.dev/',
        inLanguage: 'en',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://dating-app-staging.pages.dev/#application',
        name: 'Hart2Hart',
        applicationCategory: 'SocialNetworkingApplication',
        operatingSystem: 'Web',
        description:
          'An online dating platform for adults to discover profiles, express interest and communicate.',
        url: 'https://dating-app-staging.pages.dev/',
        image: 'https://dating-app-staging.pages.dev/logo.jpg',
        audience: { '@type': 'PeopleAudience', suggestedMinAge: 18 },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  };

  return (
    <main className="hart-landing relative min-h-screen overflow-hidden text-white">
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-3" aria-label="Hart2Hart home">
            <img
              src="/logo.jpg"
              alt=""
              className="h-11 w-11 rounded-xl object-cover shadow-lg"
              width="44"
              height="44"
            />
            <span className="text-xl font-bold tracking-tight">Hart2Hart</span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-full px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#8e3656] shadow-lg transition hover:-translate-y-0.5 hover:bg-pink-50"
            >
              Create account
            </Link>
          </nav>
        </header>

        <section className="mx-auto grid min-h-[660px] max-w-7xl items-center gap-12 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:pb-28 lg:pt-16">
          <div className="max-w-2xl">
            <p className="mb-5 inline-flex rounded-full border border-white/25 bg-black/20 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-pink-100 backdrop-blur">
              Meet with intention
            </p>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-7xl">
              Real connections start with a little curiosity.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-white/85 sm:text-lg">
              Discover people, express interest and get to know each other through
              conversations on Hart2Hart, an online dating platform created for adults.
              Take your time, make your choices and let mutual interest lead the way.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                to="/register"
                className="rounded-full bg-[#f7b5c8] px-7 py-3.5 text-sm font-bold text-[#492536] shadow-xl transition hover:-translate-y-0.5 hover:bg-white"
              >
                Join Hart2Hart
              </Link>
              <Link
                to="/login"
                className="rounded-full border border-white/45 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                I already have an account
              </Link>
            </div>
            <p className="mt-5 text-xs leading-6 text-white/65">
              For adults aged 18 and over. Use the service respectfully and protect your
              personal information.
            </p>
          </div>

          <div className="mx-auto w-full max-w-md">
            <div className="rounded-[2rem] border border-white/20 bg-black/25 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
              <div className="mb-7 flex items-center gap-4">
                <img
                  src="/logo.jpg"
                  alt="Hart2Hart"
                  className="h-16 w-16 rounded-2xl object-cover"
                  width="64"
                  height="64"
                />
                <div>
                  <p className="text-sm font-semibold text-pink-100">Hart2Hart</p>
                  <h2 className="mt-1 text-2xl font-bold">A better way to connect</h2>
                </div>
              </div>
              <ul className="space-y-5">
                <li className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 font-bold">1</span>
                  <div>
                    <h3 className="font-semibold">Create your profile</h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">Introduce yourself and share what makes you, you.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 font-bold">2</span>
                  <div>
                    <h3 className="font-semibold">Discover people</h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">Explore profiles and decide who interests you.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 font-bold">3</span>
                  <div>
                    <h3 className="font-semibold">Start a conversation</h3>
                    <p className="mt-1 text-sm leading-6 text-white/70">Build a connection when interest is mutual.</p>
                  </div>
                </li>
              </ul>
              <Link to="/register" className="mt-8 block rounded-full bg-white px-5 py-3 text-center text-sm font-bold text-[#8e3656] transition hover:bg-pink-50">
                Get started
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-black/20 px-5 py-16 backdrop-blur-sm sm:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-pink-200">How it works</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Make space for meaningful connections</h2>
              <p className="mt-4 leading-7 text-white/75">
                Whether you are exploring online dating locally or connecting with people
                across supported regions, Hart2Hart gives adults a place to discover
                profiles and start conversations at their own pace.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              <article className="rounded-2xl border border-white/15 bg-white/[0.08] p-6">
                <h3 className="text-lg font-bold">Discover profiles</h3>
                <p className="mt-3 text-sm leading-7 text-white/75">Browse member profiles and learn more before deciding whether you would like to connect.</p>
              </article>
              <article className="rounded-2xl border border-white/15 bg-white/[0.08] p-6">
                <h3 className="text-lg font-bold">Mutual interest</h3>
                <p className="mt-3 text-sm leading-7 text-white/75">Express interest in people you would like to know. Connections can grow when interest is shared.</p>
              </article>
              <article className="rounded-2xl border border-white/15 bg-white/[0.08] p-6">
                <h3 className="text-lg font-bold">Private conversations</h3>
                <p className="mt-3 text-sm leading-7 text-white/75">Continue getting to know your connections through conversations and supported communication features.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-pink-200">Helpful answers</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Frequently asked questions</h2>
            <p className="mt-4 text-sm leading-7 text-white/75">Straightforward answers about joining, discovering profiles and using Hart2Hart.</p>
          </div>
          <div className="mt-8 space-y-3">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group rounded-2xl border border-white/15 bg-black/20 p-5 backdrop-blur">
                <summary className="cursor-pointer list-none pr-6 font-semibold marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-200">
                  {question}
                </summary>
                <p className="mt-3 text-sm leading-7 text-white/75">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-5 pb-16 text-center sm:px-8">
          <div className="mx-auto max-w-4xl rounded-3xl border border-white/20 bg-black/25 px-6 py-12 backdrop-blur-lg sm:px-12">
            <h2 className="text-3xl font-bold sm:text-4xl">Your next connection starts here.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/75">Create your Hart2Hart profile and discover who you might connect with.</p>
            <Link to="/register" className="mt-7 inline-flex rounded-full bg-white px-7 py-3.5 text-sm font-bold text-[#8e3656] transition hover:bg-pink-50">
              Create your free account
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}

export default LandingPage;
