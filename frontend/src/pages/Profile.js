import React, { useEffect, useState } from "react";
import VideoProfileUpload from "../components/VideoProfileUpload";
import VideoCall from "../components/VideoCall";

function Profile() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(res => res.json())
      .then(setProfile)
      .catch(console.error);
  }, []);

  if (!profile) return <p>Loading...</p>;

  return (
    <div>
      <h1>{profile.name}</h1>
      <p>Age: {profile.age}</p>
      <p>Gender: {profile.gender}</p>
      <p>Preference: {profile.preference}</p>
      <VideoProfileUpload />
      {profile.plan === "premium" && <VideoCall />}
    </div>
  );
}

export default Profile;
