from flask import Flask, request, jsonify
import vlc
import yt_dlp
from flask_cors import CORS
import logging
from datetime import datetime, timedelta
import json
from collections import defaultdict

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {
    "origins": [
        "http://localhost:3000",
        "https://your-netlify-app.netlify.app",  # Add your Netlify domain
        "https://your-custom-domain.com"  # If you're using a custom domain
    ]
}})

# Initialize VLC player with specific options
instance = vlc.Instance('--no-xlib', '--quiet')
player = instance.media_player_new()

@app.before_request
def log_request_info():
    logger.debug('Headers: %s', dict(request.headers))
    logger.debug('Body: %s', request.get_data().decode())
    logger.debug('URL: %s', request.url)

def get_video_info(url):
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                'url': info.get('url'),
                'title': info.get('title'),
                'thumbnail_url': info.get('thumbnail'),
                'duration': info.get('duration')
            }
    except Exception as e:
        print(f"Error extracting info: {e}")
        return None

@app.route('/')
def health_check():
    logger.info("Health check endpoint called")
    return jsonify({"status": "ok"})

@app.route('/play', methods=['POST'])
def play():
    try:
        logger.info("Play endpoint called")
        url = request.json.get('url')
        
        if not url:
            logger.error("No URL provided")
            return jsonify({'error': 'No URL provided'}), 400

        logger.info(f"Attempting to play URL: {url}")

        # Extract audio URL directly
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True
        }
        
        logger.info("Extracting audio URL...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            audio_url = info['url']
            logger.info(f"Extracted audio URL: {audio_url[:50]}...")  # Log first 50 chars

            # Play the audio URL
            logger.info("Creating media...")
            media = instance.media_new(audio_url)
            
            logger.info("Setting media...")
            player.set_media(media)
            
            logger.info("Starting playback...")
            player.play()
            
            return jsonify({'status': 'playing', 'title': info.get('title')})
    except Exception as e:
        logger.error(f"Error playing: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/pause', methods=['POST'])
def pause():
    try:
        player.pause()
        return jsonify({'status': 'paused'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/resume', methods=['POST'])
def resume():
    try:
        player.play()
        return jsonify({'status': 'resumed'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_best_thumbnail(thumbnails):
    if not thumbnails:
        return None
    
    # Sort thumbnails by resolution (width * height)
    sorted_thumbnails = sorted(
        thumbnails,
        key=lambda x: (x.get('width', 0) * x.get('height', 0)),
        reverse=True
    )
    
    # Return URL of highest quality thumbnail
    return sorted_thumbnails[0]['url'] if sorted_thumbnails else None

@app.route('/get_video_details', methods=['GET'])
def get_video_details():
    try:
        url = request.args.get('url')
        logger.info(f"Received request for URL: {url}")
        
        if not url:
            return jsonify({'error': 'No URL provided'}), 400

        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False  # Changed to False to get full video info
        }
        
        logger.info("Extracting video info...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            logger.info(f"Extracted info: {info.get('title')}")
            
            # Get best quality thumbnail
            thumbnail_url = None
            if 'thumbnails' in info:
                thumbnail_url = get_best_thumbnail(info['thumbnails'])
            
            if not thumbnail_url:
                video_id = info.get('id')
                if video_id:
                    thumbnail_url = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
                else:
                    thumbnail_url = info.get('thumbnail', '')
            
            return jsonify({
                'title': info.get('title', 'Unknown Title'),
                'thumbnail_url': thumbnail_url,
                'duration': info.get('duration')
            })
    except Exception as e:
        logger.error(f"Error getting details: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/get_playlist_details', methods=['GET'])
def get_playlist_details():
    try:
        url = request.args.get('url')
        logger.info(f"Getting playlist details for URL: {url}")
        
        if not url:
            return jsonify({'error': 'No URL provided'}), 400

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist',  # Changed to get all playlist items
            'force_generic_extractor': False,
            'skip_download': True,
            'ignoreerrors': True,
            'playlist_items': '1:9999'  # Get all items in the playlist
        }

        logger.info("Extracting playlist info...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            logger.info(f"Extracted playlist info: {info.get('title')}")
            
            if 'entries' in info:
                # This is a playlist
                tracks = []
                total_duration = 0
                
                # Process all entries
                for entry in info['entries']:
                    if entry:
                        # Get the best quality thumbnail
                        thumbnail_url = None
                        if 'thumbnails' in entry:
                            thumbnail_url = get_best_thumbnail(entry['thumbnails'])
                        
                        if not thumbnail_url:
                            video_id = entry.get('id')
                            if video_id:
                                thumbnail_url = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
                            else:
                                thumbnail_url = entry.get('thumbnail', '')
                        
                        track = {
                            'url': entry.get('url') or entry.get('webpage_url'),
                            'title': entry.get('title', 'Unknown Title'),
                            'thumbnail_url': thumbnail_url,
                            'duration': entry.get('duration', 0) or 0
                        }
                        tracks.append(track)
                        total_duration += track['duration']
                
                logger.info(f"Successfully processed {len(tracks)} tracks from playlist")
                return jsonify({
                    'playlist_title': info.get('title', 'Unknown Playlist'),
                    'tracks': tracks,
                    'total_duration': total_duration,
                    'track_count': len(tracks)
                })
            else:
                return jsonify({'error': 'No playlist entries found'}), 404

    except Exception as e:
        logger.error(f"Error processing playlist: {str(e)}")
        return jsonify({'error': f'Error processing playlist: {str(e)}'}), 500

@app.route('/trending', methods=['GET'])
def get_trending():
    try:
        logger.info("Getting trending music tracks")
        
        # Configure yt-dlp options for trending music
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls'],
                    'player_skip': ['js', 'configs', 'webpage']
                }
            }
        }

        # YouTube Music Trending URL
        trending_url = 'https://www.youtube.com/feed/trending?bp=4gINGgt5dG1hX2NoYXJ0cw%3D%3D'
        
        logger.info(f"Fetching music trending from URL: {trending_url}")
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(trending_url, download=False)
            
            if not info or 'entries' not in info:
                logger.error("No trending music tracks found")
                return jsonify({'error': 'No trending tracks found'}), 404

            # Process tracks
            tracks = []
            for entry in info.get('entries', []):
                if not entry:
                    continue
                    
                # Get best quality thumbnail
                thumbnail_url = None
                if 'thumbnails' in entry:
                    thumbnails = sorted(
                        entry['thumbnails'],
                        key=lambda x: x.get('height', 0) * x.get('width', 0),
                        reverse=True
                    )
                    if thumbnails:
                        thumbnail_url = thumbnails[0]['url']
                
                if not thumbnail_url:
                    video_id = entry.get('id')
                    if video_id:
                        thumbnail_url = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
                    else:
                        thumbnail_url = entry.get('thumbnail', '')

                # Create track object
                track = {
                    'url': entry.get('url') or entry.get('webpage_url'),
                    'title': entry.get('title', 'Unknown Title'),
                    'thumbnail_url': thumbnail_url,
                    'duration': entry.get('duration', 0),
                    'view_count': entry.get('view_count', 0)
                }

                tracks.append(track)

            # Limit to top 50 tracks
            tracks = tracks[:50]

            logger.info(f"Returning {len(tracks)} trending music tracks")
            return jsonify({
                'tracks': tracks,
                'total': len(tracks)
            })

    except Exception as e:
        logger.error(f"Error getting trending music tracks: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/volume', methods=['POST'])
def set_volume():
    try:
        data = request.get_json()
        volume = data.get('volume', 1.0)
        
        # Ensure volume is between 0 and 1
        volume = max(0, min(1, float(volume)))
        
        # Convert volume to VLC's scale (0-100)
        vlc_volume = int(volume * 100)
        
        logger.info(f"Setting volume to {vlc_volume}%")
        player.audio_set_volume(vlc_volume)
        
        return jsonify({
            'status': 'success',
            'volume': volume
        })
        
    except Exception as e:
        logger.error(f"Error setting volume: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/seek', methods=['POST'])
def seek():
    try:
        position = request.json.get('position')  # Position in seconds
        if position is None:
            return jsonify({'error': 'No position provided'}), 400

        # Set position in milliseconds
        player.set_time(int(position * 1000))
        return jsonify({'status': 'success', 'position': position})
    except Exception as e:
        logger.error(f"Error seeking: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/get_position', methods=['GET'])
def get_position():
    try:
        # Get current position in milliseconds and convert to seconds
        position = player.get_time() / 1000 if player.get_time() >= 0 else 0
        duration = player.get_length() / 1000 if player.get_length() >= 0 else 0
        return jsonify({
            'position': position,
            'duration': duration
        })
    except Exception as e:
        logger.error(f"Error getting position: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting backend server on http://localhost:5000")
    try:
        app.run(host='0.0.0.0', port=5000, debug=True)
    except Exception as e:
        logger.error(f"Failed to start server: {e}")