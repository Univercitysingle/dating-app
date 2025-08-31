import React from 'react';

const TopArtists = ({ artists }) => {
  if (!artists || artists.length === 0) {
    return <p>No top artists to display.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {artists.map((artist, index) => (
        <div key={index} className="text-center">
          <img
            src={artist.artistImage}
            alt={artist.artistName}
            className="w-24 h-24 rounded-full mx-auto shadow-lg"
          />
          <p className="mt-2 text-sm font-semibold">{artist.artistName}</p>
        </div>
      ))}
    </div>
  );
};

export default TopArtists;
