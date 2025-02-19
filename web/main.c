// Copyright (c) 2020 Cesanta Software Limited
// All rights reserved

#include <signal.h>
#include "mongoose.h"

static int s_debug_level = MG_LL_INFO;
static const char *s_root_dir = "./static/";
static const char *s_addr1 = "http://0.0.0.0:8000";
static const char *s_addr2 = "https://0.0.0.0:8443";
static const char *s_enable_hexdump = "no";
static const char *s_ssi_pattern = "#.html";
static const char *s_upload_dir = NULL; // File uploads disabled by default

// Self signed certificates, see
// https://github.com/cesanta/mongoose/blob/master/test/certs/generate.sh
#ifdef TLS_TWOWAY
static const char *s_tls_ca =
    "-----BEGIN CERTIFICATE-----\n"
    "MIIBFTCBvAIJAMNTFtpfcq8NMAoGCCqGSM49BAMCMBMxETAPBgNVBAMMCE1vbmdv\n"
    "b3NlMB4XDTI0MDUwNzE0MzczNloXDTM0MDUwNTE0MzczNlowEzERMA8GA1UEAwwI\n"
    "TW9uZ29vc2UwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASuP+86T/rOWnGpEVhl\n"
    "fxYZ+pjMbCmDZ+vdnP0rjoxudwRMRQCv5slRlDK7Lxue761sdvqxWr0Ma6TFGTNg\n"
    "epsRMAoGCCqGSM49BAMCA0gAMEUCIQCwb2CxuAKm51s81S6BIoy1IcandXSohnqs\n"
    "us64BAA7QgIgGGtUrpkgFSS0oPBlCUG6YPHFVw42vTfpTC0ySwAS0M4=\n"
    "-----END CERTIFICATE-----\n";
#endif
static const char *s_tls_cert =
    "-----BEGIN CERTIFICATE-----\n"
    "MIIBMTCB2aADAgECAgkAluqkgeuV/zUwCgYIKoZIzj0EAwIwEzERMA8GA1UEAwwI\n"
    "TW9uZ29vc2UwHhcNMjQwNTA3MTQzNzM2WhcNMzQwNTA1MTQzNzM2WjARMQ8wDQYD\n"
    "VQQDDAZzZXJ2ZXIwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASo3oEiG+BuTt5y\n"
    "ZRyfwNr0C+SP+4M0RG2pYkb2v+ivbpfi72NHkmXiF/kbHXtgmSrn/PeTqiA8M+mg\n"
    "BhYjDX+zoxgwFjAUBgNVHREEDTALgglsb2NhbGhvc3QwCgYIKoZIzj0EAwIDRwAw\n"
    "RAIgTXW9MITQSwzqbNTxUUdt9DcB+8pPUTbWZpiXcA26GMYCIBiYw+DSFMLHmkHF\n"
    "+5U3NXW3gVCLN9ntD5DAx8LTG8sB\n"
    "-----END CERTIFICATE-----\n";

static const char *s_tls_key =
    "-----BEGIN EC PRIVATE KEY-----\n"
    "MHcCAQEEIAVdo8UAScxG7jiuNY2UZESNX/KPH8qJ0u0gOMMsAzYWoAoGCCqGSM49\n"
    "AwEHoUQDQgAEqN6BIhvgbk7ecmUcn8Da9Avkj/uDNERtqWJG9r/or26X4u9jR5Jl\n"
    "4hf5Gx17YJkq5/z3k6ogPDPpoAYWIw1/sw==\n"
    "-----END EC PRIVATE KEY-----\n";

// Handle interrupts, like Ctrl-C
static int s_signo;
static void signal_handler(int signo)
{
  s_signo = signo;
}

struct record
{
  double temperature;
  double humidity;
  int date;
};

struct DB
{
  size_t len;
  struct record buf[1024];
};

struct DB* db;  // Initialize DB with zero length
int save_data(struct mg_str body) {
  printf("Received body: %s\n", body.buf);
  printf("Body length: %zu\n", body.len); // ADDED: Print body length
  printf("First 16 bytes of body (hex): "); // ADDED: Hex dump of first 16 bytes
  for (size_t i = 0; i < body.len && i < 16; ++i) {
      printf("%02x ", (unsigned char)body.buf[i]);
  }
  printf("\n");

  if (db->len >= 1024) {
      return -1;  // Buffer full
  }

  struct record new_record;

  // Extract numerical values
  double date;
  if (!mg_json_get_num(body, "date", &date)) {
      printf("Error: failed to parse date\n");
      return 1;
  }
  new_record.date = (int)date;

  if (!mg_json_get_num(body, "temperature", &new_record.temperature)) {
      printf("Error: failed to parse temperature\n");
      return 2;  // Error parsing temperature
  }

  if (!mg_json_get_num(body, "humidity", &new_record.humidity)) {
      printf("Error: failed to parse humidity\n");
      return 3;  // Error parsing humidity
  }

  // Add the new record to the buffer
  db->buf[db->len++] = new_record;

  return 0;  // Success
}

char *get_data_as_html() {
  size_t data_size = 1024;
  char *data = malloc(data_size);
  if (data == NULL) {
    return NULL;  // Error allocating memory
  }

  for (size_t i = 0; i < db->len; ++i) {
    char row[256];
    sprintf(row, "<tr><td>%d</td><td>%lf</td><td>%lf</td></tr>", db->buf[i].date, db->buf[i].temperature, db->buf[i].humidity);
    
    if (strlen(data) + strlen(row) + 1 > data_size) {
      data_size *= 2;
      data = realloc(data, data_size);
      if (data == NULL) {
        return NULL;  // Error reallocating memory
      }
    }
    strcat(data, row);
  }

  return data;
}

// Event handler for the listening connection.
// Simply serve static files from `s_root_dir`
static void cb(struct mg_connection *c, int ev, void *ev_data)
{
  if (ev == MG_EV_ACCEPT && c->fn_data != NULL)
  {
    struct mg_tls_opts opts;
    memset(&opts, 0, sizeof(opts));
#ifdef TLS_TWOWAY
    opts.ca = mg_str(s_tls_ca);
#endif
    opts.cert = mg_str(s_tls_cert);
    opts.key = mg_str(s_tls_key);
    mg_tls_init(c, &opts);
  }
  if (ev == MG_EV_HTTP_MSG)
  {
    struct mg_http_message *hm = ev_data;
    if (mg_match(hm->uri, mg_str("/api/data/get"), NULL))
    {

      mg_http_reply(c, 200, NULL, get_data_as_html());
    }
    else if (mg_match(hm->uri, mg_str("/api/data/create"), NULL))
    {
      struct mg_str content_type_header = *mg_http_get_header(hm, "Content-Type");
      if (mg_strcmp(content_type_header, mg_str_s("application/json")) != 0)
      {
        mg_http_reply(c, 400, NULL, "nichts gut\n");
      }
      else
      {
        int saved = save_data(hm->body);
        MG_LOG(MG_LL_INFO,("\n%d\n", saved));
        if (saved != 0)
        {
          mg_http_reply(c, 500, NULL, "couldn't save data\n");
        }
        else
        {
          mg_http_reply(c, 200, NULL, "data saved successfully\n");
        }
      }
    }
    else
    {
      // Serve web root directory
      struct mg_http_serve_opts opts = {0};
      opts.root_dir = s_root_dir;
      opts.ssi_pattern = s_ssi_pattern;
      mg_http_serve_dir(c, hm, &opts);
    }

    // Log request
    MG_INFO(("%.*s %.*s %lu -> %.*s %lu", hm->method.len, hm->method.buf,
             hm->uri.len, hm->uri.buf, hm->body.len, 3, c->send.buf + 9,
             c->send.len));
  }
}

static void usage(const char *prog)
{
  fprintf(stderr,
          "Mongoose v.%s\n"
          "Usage: %s OPTIONS\n"
          "  -H yes|no - enable traffic hexdump, default: '%s'\n"
          "  -S PAT    - SSI filename pattern, default: '%s'\n"
          "  -d DIR    - directory to serve, default: '%s'\n"
          "  -l ADDR   - listening address, default: '%s'\n"
          "  -u DIR    - file upload directory, default: unset\n"
          "  -v LEVEL  - debug level, from 0 to 4, default: %d\n",
          MG_VERSION, prog, s_enable_hexdump, s_ssi_pattern, s_root_dir,
          s_addr1, s_debug_level);
  exit(EXIT_FAILURE);
}

int main(int argc, char *argv[])
{
  char path[MG_PATH_MAX] = ".";
  struct mg_mgr mgr;
  struct mg_connection *c;
  int i;
  db = malloc(sizeof(struct DB));
  (*db) = (struct DB){0};
  // Parse command-line flags
  for (i = 1; i < argc; i++)
  {
    if (strcmp(argv[i], "-d") == 0)
    {
      s_root_dir = argv[++i];
    }
    else if (strcmp(argv[i], "-H") == 0)
    {
      s_enable_hexdump = argv[++i];
    }
    else if (strcmp(argv[i], "-S") == 0)
    {
      s_ssi_pattern = argv[++i];
    }
    else if (strcmp(argv[i], "-l") == 0)
    {
      s_addr1 = argv[++i];
    }
    else if (strcmp(argv[i], "-l2") == 0)
    {
      s_addr2 = argv[++i];
    }
    else if (strcmp(argv[i], "-u") == 0)
    {
      s_upload_dir = argv[++i];
    }
    else if (strcmp(argv[i], "-v") == 0)
    {
      s_debug_level = atoi(argv[++i]);
    }
    else
    {
      usage(argv[0]);
    }
  }

  // Root directory must not contain double dots. Make it absolute
  // Do the conversion only if the root dir spec does not contain overrides
  if (strchr(s_root_dir, ',') == NULL)
  {
    realpath(s_root_dir, path);
    s_root_dir = path;
  }

  // Initialise stuff
  signal(SIGINT, signal_handler);
  signal(SIGTERM, signal_handler);
  mg_log_set(s_debug_level);
  mg_mgr_init(&mgr);
  if ((c = mg_http_listen(&mgr, s_addr1, cb, NULL)) == NULL)
  {
    MG_ERROR(("Cannot listen on %s. Use http://ADDR:PORT or :PORT",
              s_addr1));
    exit(EXIT_FAILURE);
  }
  if ((c = mg_http_listen(&mgr, s_addr2, cb, (void *)1)) == NULL)
  {
    MG_ERROR(("Cannot listen on %s. Use http://ADDR:PORT or :PORT",
              s_addr2));
    exit(EXIT_FAILURE);
  }
  if (mg_casecmp(s_enable_hexdump, "yes") == 0)
    c->is_hexdumping = 1;

  // Start infinite event loop
  MG_INFO(("Mongoose version : v%s", MG_VERSION));
  MG_INFO(("HTTP listener    : %s", s_addr1));
  MG_INFO(("HTTPS listener   : %s", s_addr2));
  MG_INFO(("Web root         : [%s]", s_root_dir));
  MG_INFO(("Upload dir       : [%s]", s_upload_dir ? s_upload_dir : "unset"));
  while (s_signo == 0)
    mg_mgr_poll(&mgr, 1000);
  mg_mgr_free(&mgr);
  MG_INFO(("Exiting on signal %d", s_signo));
  return 0;
}
