'use client';
import Link from 'next/link';
import Image from 'next/image';

export default function LandingPage() {
  const catalogItems = [
    {
      name: 'Toyota Vios 2025',
      image: '/pictures/Toyota Vios 2025.jpg',
      description: 'Latest model with modern features and exceptional fuel efficiency.',
      tag: 'New Arrival'
    },
    {
      name: 'Mitsubishi TRITON 2025',
      image: '/pictures/Mitsubishi TRITON 2025.jpg',
      description: 'Powerful pickup truck built for adventure and heavy-duty performance.',
      tag: 'Best Seller'
    },
    {
      name: 'Toyota Grandia GL 2024',
      image: '/pictures/Toyota_Grandia_GL_2024.jpg',
      description: 'Spacious family van with premium comfort and reliability.',
      tag: 'Premium'
    },
    {
      name: 'Toyota Vios 2020',
      image: '/pictures/Toyota Vios 2020.jpg',
      description: 'Trusted sedan with proven performance and value.',
      tag: 'Classic'
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <section className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400 font-semibold">
              Premium Automotive
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-zinc-900 dark:text-white mt-3">
              Quality vehicles that drive your journey forward.
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-300 mt-5">
              Discover our range of reliable Toyota and Mitsubishi vehicles,
              from efficient sedans to powerful pickup trucks and spacious family vans.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-8">
              <a
                href="#catalog"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-500 transition-colors"
              >
                Explore the catalog
              </a>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Swipe the catalog to browse designs
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-amber-200/40 via-amber-100/10 to-transparent rounded-3xl blur-2xl" />
            <div className="relative rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 p-8 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Quality Selection</h2>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  2026 Collection
                </span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-3">
                From daily commuters to family adventures, our vehicles are selected for reliability,
                performance, and value. Every vehicle is backed by trusted brands.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-4">
                  <p className="text-zinc-500 dark:text-zinc-400">Delivery Time</p>
                  <p className="text-lg font-semibold text-zinc-900 dark:text-white">2-4 Weeks</p>
                </div>
                <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-4">
                  <p className="text-zinc-500 dark:text-zinc-400">Available Models</p>
                  <p className="text-lg font-semibold text-zinc-900 dark:text-white">15+ Options</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="catalog" className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Catalog Highlights</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Swipe to explore our featured vehicles.</p>
            </div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Swipe →</span>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory">
            {catalogItems.map((item) => (
              <div
                key={item.name}
                className="min-w-[260px] sm:min-w-[320px] snap-center rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{item.name}</h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    {item.tag}
                  </span>
                </div>
                <div className="mt-4 h-48 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
                  <Image 
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-4">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/place-order"
              className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
            >
              Place Your Order Now
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Premium Automotive</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Quality vehicles and trusted service.</p>
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            © 2026 Premium Automotive. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}


