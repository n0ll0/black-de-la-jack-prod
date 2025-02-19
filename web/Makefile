PROG ?= server.exe                   # Program we are building
DELETE = rm -rf                   # Command to remove files
OUT ?= -o $(PROG)                 # Compiler argument for output file
SOURCES = main.c mongoose.c cJSON.c cJSON_Utils.c      # Source code files
CFLAGS = -W -Wall -Wextra -g #-I. # Build options
#CFLAGS += -fsanitize=address,undefined,alignment
LDFLAGS = -Wl,-L/usr/lib/x86_64-linux-gnu
# Mongoose build options. See https://mongoose.ws/documentation/#build-options
CFLAGS_MONGOOSE += -DMG_HTTP_DIRLIST_TIME_FMT="%Y/%m/%d %H:%M:%S"
CFLAGS_MONGOOSE += -DMG_ENABLE_LINES=1 -DMG_ENABLE_IPV6=1 -DMG_ENABLE_SSI=1
CFLAGS_EXTRA ?= -DMG_TLS=MG_TLS_BUILTIN

ifeq ($(OS),Windows_NT)   # Windows settings. Assume MinGW compiler. To use VC: make CC=cl CFLAGS=/MD OUT=/Feprog.exe
  PROG ?= server.exe           # Use .exe suffix for the binary
  CC = gcc                      # Use MinGW gcc compiler
  CFLAGS += -IC:/usr/include -lws2_32 -lbcrypt -lsqlite3   # Link against Winsock library
  DELETE = cmd /C del /Q /F /S  # Command prompt command to delete files
  OUT ?= -o $(PROG)             # Build output
else  # Linux/macOS
  CC = gcc
  CFLAGS += -I/usr/include -lsqlite3 # Linux/macOS linking
endif

all: $(PROG)              # Default target. Build and run program
	$(RUN) ./$(PROG) $(ARGS)

$(PROG): $(SOURCES)       # Build program from sources
	$(CC) $(SOURCES) $(CFLAGS) $(CFLAGS_MONGOOSE) $(CFLAGS_EXTRA) $(LDFLAGS) $(OUT)

vc98:
	cl $(SOURCES) -DMG_ENABLE_SSI=1 -DMG_TLS=MG_TLS_BUILTIN

clean:                    # Cleanup. Delete built program and all build artifacts
	$(DELETE) $(PROG) *.o *.obj *.exe *.dSYM
