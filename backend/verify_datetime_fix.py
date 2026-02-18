from datetime import datetime, timezone
import pytz

def reproduce_error():
    print("--- Simulating the Error ---")
    # Naive datetime (simulating MongoDB retrieval when tz_aware=False)
    start_dt = datetime.utcnow()
    # Aware datetime (simulating ISO parsing: datetime.fromisoformat('2026-02-18T12:00:00+00:00'))
    new_end_dt = datetime.now(timezone.utc)
    
    print(f"Start DT (naive): {start_dt}")
    print(f"End DT (aware): {new_end_dt}")
    
    try:
        if start_dt >= new_end_dt:
            print("Comparison worked (Unexpectedly)")
        else:
            print("Comparison worked (Unexpectedly)")
    except TypeError as e:
        print(f"Caught expected error: {e}")

def verify_fix():
    print("\n--- Verifying the Fix logic ---")
    # Naive datetime
    start_dt = datetime.utcnow()
    # Aware datetime
    new_end_dt = datetime.now(timezone.utc)
    
    # Logic applied in the fix:
    temp_start = start_dt
    temp_new_end = new_end_dt
    
    if temp_start.tzinfo is None:
        temp_start = temp_start.replace(tzinfo=timezone.utc)
    if temp_new_end.tzinfo is None:
        temp_new_end = temp_new_end.replace(tzinfo=timezone.utc)
        
    print(f"Normalized Start DT: {temp_start}")
    print(f"Normalized End DT: {temp_new_end}")
    
    try:
        is_after = temp_start >= temp_new_end
        print(f"Comparison worked! Result (start >= end): {is_after}")
        return True
    except TypeError as e:
        print(f"Fix failed! Caught error: {e}")
        return False

if __name__ == "__main__":
    reproduce_error()
    if verify_fix():
        print("\nFix logic verified successfully!")
    else:
        print("\nFix logic verification failed!")
        exit(1)
