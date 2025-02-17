const ytdl = require('ytdl-core');
const ytsr = require('ytsr');
const { getInfo } = require('ytdl-core');

async function getPlaylistDetails(url) {
  try {
    const playlistID = new URL(url).searchParams.get('list');
    const playlist = await ytsr(`https://www.youtube.com/playlist?list=${playlistID}`, {
      limit: 100,
      pages: 1
    });

    const videos = playlist.items
      .filter(item => item.type === 'video')
      .map(item => ({
        title: item.title,
        url: item.url,
        thumbnail: item.bestThumbnail.url,
        duration: item.duration
      }));

    return { success: true, videos };
  } catch (error) {
    console.error('Playlist error:', error);
    return { success: false, error: error.message };
  }
}

async function getVideoDetails(url) {
  try {
    const info = await getInfo(url);
    return {
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[0].url,
      duration: info.videoDetails.lengthSeconds
    };
  } catch (error) {
    console.error('Video details error:', error);
    return null;
  }
}

module.exports = { getPlaylistDetails, getVideoDetails };