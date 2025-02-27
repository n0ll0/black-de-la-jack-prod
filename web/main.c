// Copyright (c) 2020 Cesanta Software Limited
// All rights reserved

#include <signal.h>
#include "mongoose.h"
#include <sqlite3.h>
#include "cJSON.h"

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
  double date;
};

sqlite3 *db;

int save_data(struct mg_str body)
{
  // Print the received JSON body
  printf("Received body: %.*s\n", (int)body.len, body.buf);
  printf("Body length: %zu\n", body.len);

  // Copy JSON into a dynamically allocated buffer
  char *json_buf = malloc(body.len + 1);
  if (json_buf == NULL)
  {
    fprintf(stderr, "Error: Memory allocation failed\n");
    return 5;
  }
  memcpy(json_buf, body.buf, body.len);
  json_buf[body.len] = '\0'; // Ensure null-terminated

  // Define a structure to hold our record data
  struct record new_record;

  // Parse the JSON using cJSON
  cJSON *root = cJSON_Parse(json_buf);
  free(json_buf); // Free the JSON buffer after parsing
  if (!root)
  {
    fprintf(stderr, "Error: Failed to parse JSON\n");
    return 1;
  }

  // Extract "date"
  cJSON *date_item = cJSON_GetObjectItemCaseSensitive(root, "date");
  if (!cJSON_IsNumber(date_item))
  {
    fprintf(stderr, "Error: Failed to parse date\n");
    cJSON_Delete(root);
    return 1;
  }
  new_record.date = date_item->valuedouble;

  // Extract "temperature"
  cJSON *temp_item = cJSON_GetObjectItemCaseSensitive(root, "temperature");
  if (!cJSON_IsNumber(temp_item))
  {
    fprintf(stderr, "Error: Failed to parse temperature\n");
    cJSON_Delete(root);
    return 2;
  }
  new_record.temperature = temp_item->valuedouble;

  // Extract "humidity"
  cJSON *humidity_item = cJSON_GetObjectItemCaseSensitive(root, "humidity");
  if (!cJSON_IsNumber(humidity_item))
  {
    fprintf(stderr, "Error: Failed to parse humidity\n");
    cJSON_Delete(root);
    return 3;
  }
  new_record.humidity = humidity_item->valuedouble;

  // Build the SQL query string using a dynamic buffer
  char sql[256];
  sprintf(sql,
           "INSERT INTO sensor_data (date, temperature, humidity) VALUES (%lf, %lf, %lf);",
           new_record.date, new_record.temperature, new_record.humidity);

  char *err_msg = NULL;
  int rc = sqlite3_exec(db, sql, 0, 0, &err_msg);
  if (rc != SQLITE_OK)
  {
    fprintf(stderr, "SQL error: %s\n", err_msg);
    sqlite3_free(err_msg);
    cJSON_Delete(root);
    return 4;
  }

  // Clean up cJSON object
  cJSON_Delete(root);
  return 0; // Success
}

int html_callback(void *data, int argc, char **argv, char **azColName) {
  // Calculate the required size for the new row
  size_t row_size = snprintf(NULL, 0, "<tr><td>%s</td><td>%s</td><td>%s</td></tr>", argv[0], argv[1], argv[2]) + 1;
  
  // Reallocate `data` to fit the new row
  char **data_ptr = (char **)data;
  size_t current_length = strlen(*data_ptr);
  *data_ptr = realloc(*data_ptr, current_length + row_size);
  if (*data_ptr == NULL) {
    fprintf(stderr, "Error reallocating memory\n");
    return 1; // Return a non-zero value to stop `sqlite3_exec`
  }
  
  // Append the new row to `data`
  sprintf(*data_ptr + current_length, "<tr><td>%s</td><td>%s</td><td>%s</td></tr>", argv[0], argv[1], argv[2]);
  return 0;
}

char *get_data_as_html() {
  char *err_msg = 0;
  char sql[256] = "SELECT date, temperature, humidity FROM sensor_data ORDER BY date DESC LIMIT 20;";
  
  // Allocate initial memory for the data buffer
  char *data = malloc(1024);
  if (data == NULL) {
    fprintf(stderr, "Error allocating memory\n");
    return NULL;
  }
  data[0] = '\0'; // Initialize as an empty string

  // Use a pointer to the data buffer for easier reallocation in the callback
  char *data_ptr = data;

  // Call sqlite3_exec with the callback
  int rc = sqlite3_exec(db, sql, html_callback, &data_ptr, &err_msg);
  if (rc != SQLITE_OK) {
    fprintf(stderr, "SQL error: %s\n", err_msg);
    sqlite3_free(err_msg);
    free(data_ptr);
    return NULL;
  }

  return data_ptr;
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
      char *data = get_data_as_html();
      mg_http_reply(c, 200, NULL, data);
      free(data);
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
        MG_LOG(MG_LL_INFO, ("\n%d\n", saved));
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
  char *err_msg = 0;
  int rc;

  const char *db_path = getenv("DB_PATH");

  rc = sqlite3_open(db_path, &db);
  if (rc != SQLITE_OK)
  {
    fprintf(stderr, "Cannot open database: %s\n", sqlite3_errmsg(db));
    return 1; // Exit with error code
  }

  // char *err_msg = 0;
  const char *create_table_sql = "CREATE TABLE IF NOT EXISTS sensor_data (date REAL, temperature REAL, humidity REAL);";
  rc = sqlite3_exec(db, create_table_sql, 0, 0, &err_msg);

  if (rc != SQLITE_OK)
  {
    fprintf(stderr, "SQL error: %s\n", err_msg);
    sqlite3_free(err_msg);
    sqlite3_close(db);
    return 1;
  }
  // Parse command-line flags
  for (int i = 1; i < argc; i++)
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
  sqlite3_close(db);
  mg_mgr_free(&mgr);
  MG_INFO(("Exiting on signal %d", s_signo));
  return 0;
}
