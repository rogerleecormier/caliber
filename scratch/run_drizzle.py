import pty
import os
import subprocess
import sys
import select

def run():
    master_fd, slave_fd = pty.openpty()
    
    proc = subprocess.Popen(
        ['npx', 'drizzle-kit', 'generate'],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True
    )
    
    os.close(slave_fd)
    
    buffer = b""
    while proc.poll() is None:
        try:
            r, w, x = select.select([master_fd], [], [], 0.5)
            if master_fd in r:
                data = os.read(master_fd, 1024)
                if not data:
                    break
                buffer += data
                sys.stdout.buffer.write(data)
                sys.stdout.flush()
                
                # Check for inquirer prompts
                if b"Is " in data and (b"created" in data or b"renamed" in data or b"?" in data):
                    # Inquirer expects carriage return (\r) as the Enter key!
                    os.write(master_fd, b"\r")
                    sys.stdout.write("\n[run_drizzle.py] Auto-selected default option (\\r)\n")
                    sys.stdout.flush()
        except Exception as e:
            print("Error during execution:", e)
            break
            
    # Clean up remaining output
    try:
        r, w, x = select.select([master_fd], [], [], 1.0)
        if master_fd in r:
            data = os.read(master_fd, 1024)
            sys.stdout.buffer.write(data)
            sys.stdout.flush()
    except:
        pass

    print("\nProcess finished with exit code:", proc.returncode)
    sys.exit(proc.returncode)

if __name__ == '__main__':
    run()
