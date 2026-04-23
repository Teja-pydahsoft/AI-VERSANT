import os
import uuid
import logging
import shutil
import boto3
from config.aws_config import s3_client, S3_BUCKET_NAME, is_aws_configured, get_s3_client_safe

logger = logging.getLogger(__name__)

# Make audio processing packages optional
try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False
    print("Warning: gTTS package not available. Audio generation will not work.")

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    print("Warning: pydub package not available. Audio processing will not work.")

def generate_audio_from_text(text, accent='en', speed=1.0, max_retries=3):
    """Generate audio from text using gTTS with custom accent and speed"""
    if not GTTS_AVAILABLE:
        raise Exception("Audio generation not available - gTTS package is missing. Please install it using: pip install gtts")
    
    if not PYDUB_AVAILABLE:
        raise Exception("Audio generation not available - pydub package is missing. Please install it using: pip install pydub")
    
    # Check if S3 is configured
    s3_available = is_aws_configured()
    
    if not s3_available:
        raise Exception("AWS S3 is not configured. Please set AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION, and AWS_S3_BUCKET environment variables. Audio files can only be stored on AWS S3.")
    
    for attempt in range(max_retries):
        try:
            # Ensure speed is a float to prevent type comparison errors
            try:
                speed = float(speed) if speed is not None else 1.0
            except (ValueError, TypeError):
                speed = 1.0
                print(f"Warning: Invalid speed value '{speed}', using default 1.0")
            
            # Create gTTS object with specified accent
            # Handle deprecated language codes
            if accent == 'en-US':
                accent = 'en'  # gTTS prefers 'en' over 'en-US'
                print(f"⚠️  Language code 'en-US' deprecated, using 'en' instead")
            
            tts = gTTS(text=text, lang=accent, slow=(speed < 1.0))
            
            # Generate temporary file
            temp_filename = f"temp_{uuid.uuid4()}.mp3"
            tts.save(temp_filename)
            
            # Load audio and adjust speed if needed
            audio = AudioSegment.from_mp3(temp_filename)
            if speed != 1.0:
                # Adjust playback speed
                new_frame_rate = int(audio.frame_rate * speed)
                audio = audio._spawn(audio.raw_data, overrides={'frame_rate': new_frame_rate})
                audio = audio.set_frame_rate(audio.frame_rate)
            
            # Save adjusted audio
            adjusted_filename = f"adjusted_{uuid.uuid4()}.mp3"
            audio.export(adjusted_filename, format="mp3")
            
            # Upload to AWS S3 (no fallback to local storage)
            current_s3_client = get_s3_client_safe()
            if current_s3_client is None:
                raise Exception("S3 client is not available. Please check AWS configuration.")
            
            s3_key = f"audio/practice_tests/{uuid.uuid4()}.mp3"
            current_s3_client.upload_file(adjusted_filename, S3_BUCKET_NAME, s3_key)
            
            # Clean up temporary files
            try:
                os.remove(temp_filename)
                os.remove(adjusted_filename)
            except Exception as cleanup_error:
                print(f"Warning: Failed to cleanup temporary files: {cleanup_error}")
            
            return s3_key
            
        except Exception as e:
            if "429" in str(e) or "Too Many Requests" in str(e):
                if attempt < max_retries - 1:
                    # Simple retry with short delay
                    wait_time = 2 ** attempt  # 2, 4, 8 seconds
                    print(f"Rate limit hit (attempt {attempt + 1}/{max_retries}). Waiting {wait_time} seconds before retry...")
                    import time
                    time.sleep(wait_time)
                    continue
                else:
                    raise Exception(f"Google TTS API rate limit exceeded after {max_retries} attempts. Please wait a few minutes and try again.")
            elif "gTTS" in str(e):
                raise Exception(f"Text-to-speech conversion failed: {str(e)}. Please check the text content and try again.")
            elif "AudioSegment" in str(e):
                raise Exception(f"Audio processing failed: {str(e)}. Please check if the audio file was generated correctly.")
            elif "S3" in str(e) or "AWS" in str(e):
                raise Exception(f"AWS S3 error: {str(e)}. Please check AWS configuration and try again.")
            else:
                raise Exception(f"Audio generation failed: {str(e)}. Please try again or contact support.")
    
    # If we get here, all retries failed
    raise Exception("Audio generation failed after all retry attempts")

def is_audio_generation_available():
    """Check if audio generation is available"""
    # Audio generation is available if we have the required packages
    # S3 is optional - we can fall back to local storage
    return GTTS_AVAILABLE and PYDUB_AVAILABLE

def get_audio_generation_status():
    """Get detailed status of audio generation capabilities"""
    from config.aws_config import get_aws_status
    
    aws_status = get_aws_status()
    
    # Audio generation is available if we have the required packages
    # S3 is optional - we can fall back to local storage
    fully_available = GTTS_AVAILABLE and PYDUB_AVAILABLE
    
    if fully_available:
        if aws_status['configured']:
            message = 'Audio generation is ready for bulk operations with AWS S3 storage'
        else:
            message = 'Audio generation requires AWS S3 configuration. Please set AWS credentials.'
    else:
        message = 'Audio generation has package issues - missing required dependencies'
    
    return {
        'gtts_available': GTTS_AVAILABLE,
        'pydub_available': PYDUB_AVAILABLE,
        'aws_configured': aws_status['configured'],
        'fully_available': fully_available and aws_status['configured'],  # Only fully available if AWS is configured
        'message': message,
        'aws_status': aws_status,
        'storage_type': 'S3' if aws_status['configured'] else 'Not Available',
        'local_storage_available': False,  # Local storage is disabled
        'recommendation': 'AWS S3 is required for audio generation. Please configure AWS credentials.'
    }

def calculate_similarity(original_text, student_audio_text):
    """Calculate similarity score between original and student audio text"""
    try:
        from difflib import SequenceMatcher
        
        print(f"Calculating similarity between:")
        print(f"  Original: '{original_text}'")
        print(f"  Student: '{student_audio_text}'")
        
        # Handle empty texts
        if not original_text or not student_audio_text:
            print("One or both texts are empty, returning 0.0")
            return 0.0
        
        # Convert to lowercase for better comparison
        original_lower = original_text.lower().strip()
        student_lower = student_audio_text.lower().strip()
        
        print(f"  Original (lower): '{original_lower}'")
        print(f"  Student (lower): '{student_lower}'")
        
        # Calculate similarity using SequenceMatcher
        similarity = SequenceMatcher(None, original_lower, student_lower).ratio()
        print(f"  SequenceMatcher similarity: {similarity}")
        
        # Calculate word-level accuracy
        original_words = set(original_lower.split())
        student_words = set(student_lower.split())
        
        print(f"  Original words: {original_words}")
        print(f"  Student words: {student_words}")
        
        if not original_words:
            print("No original words found, returning 0.0")
            return 0.0
        
        word_accuracy = len(original_words.intersection(student_words)) / len(original_words)
        print(f"  Word accuracy: {word_accuracy}")
        
        # Combine similarity and word accuracy
        final_score = (similarity * 0.7) + (word_accuracy * 0.3)
        print(f"  Final score: {final_score}")
        
        return round(final_score * 100, 2)
    except Exception as e:
        print(f"Error calculating similarity: {str(e)}")
        return 0.0

# Alias for backward compatibility
calculate_similarity_score = calculate_similarity

def transcribe_audio(audio_file_path):
    """Transcribe audio file to text using speech recognition"""
    try:
        ffmpeg_bin = shutil.which('ffmpeg')
        if not ffmpeg_bin:
            logger.error(
                'transcribe_audio: ffmpeg not found on PATH (pid=%s, PATH=%s). '
                'Install ffmpeg or set PATH for your WSGI service (e.g. systemd Environment=PATH=...:/usr/bin).',
                os.getpid(),
                os.environ.get('PATH', ''),
            )
        else:
            logger.debug('transcribe_audio: using ffmpeg at %s', ffmpeg_bin)

        # Try to import speech_recognition, but make it optional
        try:
            import speech_recognition as sr
        except ImportError:
            logger.warning('speech_recognition not installed; pip install SpeechRecognition')
            return ""

        # Check if pydub is available for format conversion
        if not PYDUB_AVAILABLE:
            logger.warning('pydub not installed; pip install pydub')
            return ""

        recognizer = sr.Recognizer()

        # Convert audio to WAV format if needed
        temp_wav_path = None
        try:
            logger.info('transcribe_audio: loading %s', audio_file_path)
            audio_segment = AudioSegment.from_file(audio_file_path)
            logger.info(
                'transcribe_audio: loaded %sms, %sHz, %s ch',
                len(audio_segment),
                audio_segment.frame_rate,
                audio_segment.channels,
            )

            # Convert to WAV format with proper parameters
            temp_wav_path = f"temp_converted_{uuid.uuid4()}.wav"

            # Set proper audio parameters for speech recognition
            audio_segment = audio_segment.set_frame_rate(16000).set_channels(1)
            audio_segment.export(temp_wav_path, format="wav")

            logger.info('transcribe_audio: wav %s bytes', os.path.getsize(temp_wav_path))

            duration_sec = len(audio_segment) / 1000.0
            # Do not use a full 0.5s noise sample on very short clips (browser recordings are often 2–4s)
            noise_cal_sec = min(0.5, max(0.1, duration_sec * 0.25))

            # Use the converted WAV file for transcription
            with sr.AudioFile(temp_wav_path) as source:
                recognizer.adjust_for_ambient_noise(source, duration=noise_cal_sec)
                audio = recognizer.record(source)
                text = recognizer.recognize_google(audio)
                logger.info('transcribe_audio: google ok, len=%s', len(text or ''))
                return text

        except sr.UnknownValueError:
            logger.warning('transcribe_audio: Google Speech could not understand audio (empty or unclear)')
            return ""
        except sr.RequestError as e:
            logger.error('transcribe_audio: Google Speech API request failed: %s', e)
            return ""
        except Exception as conversion_error:
            logger.warning('transcribe_audio: convert path failed: %s', conversion_error, exc_info=True)
            # Fallback: try direct transcription if conversion fails
            try:
                with sr.AudioFile(audio_file_path) as source:
                    recognizer.adjust_for_ambient_noise(source, duration=0.2)
                    audio = recognizer.record(source)
                    text = recognizer.recognize_google(audio)
                    return text
            except Exception as fallback_error:
                logger.warning('transcribe_audio: fallback failed: %s', fallback_error, exc_info=True)
                return ""
        finally:
            # Clean up temporary file
            if temp_wav_path and os.path.exists(temp_wav_path):
                try:
                    os.remove(temp_wav_path)
                except Exception as cleanup_error:
                    logger.warning('transcribe_audio: temp wav cleanup failed: %s', cleanup_error)

    except Exception as e:
        logger.exception('transcribe_audio: unexpected error: %s', e)
        return ""