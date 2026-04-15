# DS Project 3 — result ingestion API for the Monkeytype A/B study.
# Run from repo root:  R -e "setwd('study-collector'); plumber::pr_run(plumber::pr('plumber.R'), host='0.0.0.0', port=8787)"
# Point the frontend at: VITE_DS3_COLLECT_URL=http://localhost:8787/submit
# (use your LAN IP instead of localhost if testing from a phone).

library(plumber)
library(jsonlite)

`%||%` <- function(a, b) if (!is.null(a) && length(a) > 0) a else b

data_dir <- file.path(getwd(), "data")
dir.create(data_dir, showWarnings = FALSE)
csv_path <- file.path(data_dir, "submissions.csv")

ensure_header <- function() {
  if (!file.exists(csv_path)) {
    writeLines(
      paste(
        c(
          "received_at", "event", "participant_id", "external_id", "variant",
          "wpm", "acc", "raw_wpm", "test_duration", "mode", "mode2", "user_agent"
        ),
        collapse = ","
      ),
      csv_path
    )
  }
}

csv_escape <- function(x) {
  x <- as.character(x)
  x[is.na(x)] <- ""
  ifelse(
    grepl('[,\\"]', x, perl = TRUE),
    paste0('"', gsub('"', '""', x, fixed = TRUE), '"'),
    x
  )
}

#* @filter cors
cors <- function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (identical(req$REQUEST_METHOD, "OPTIONS")) {
    res$status <- 204L
    return(list())
  }
  forward()
}

#* Health check
#* @get /health
function() {
  list(ok = TRUE)
}

#* Accept one JSON row from the typing app (completed or assigned)
#* @post /submit
function(req) {
  ensure_header()
  body <- tryCatch(
    fromJSON(req$postBody, simplifyVector = TRUE),
    error = function(e) NULL
  )
  if (is.null(body)) {
    return(list(error = "invalid_json"))
  }

  received <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  event <- body$event %||% "completed"
  pid <- body$participantId %||% ""
  ext <- body$externalId %||% ""
  variant <- body$variant %||% ""
  wpm <- suppressWarnings(as.numeric(body$wpm %||% NA_real_))
  acc <- suppressWarnings(as.numeric(body$acc %||% NA_real_))
  raw_wpm <- suppressWarnings(as.numeric(body$rawWpm %||% NA_real_))
  test_dur <- suppressWarnings(as.numeric(body$testDuration %||% NA_real_))
  mode <- as.character(body$mode %||% "")
  mode2 <- as.character(body$mode2 %||% "")
  ua <- as.character(body$userAgent %||% "")

  line <- paste(
    csv_escape(received),
    csv_escape(event),
    csv_escape(pid),
    csv_escape(ext),
    csv_escape(variant),
    csv_escape(wpm),
    csv_escape(acc),
    csv_escape(raw_wpm),
    csv_escape(test_dur),
    csv_escape(mode),
    csv_escape(mode2),
    csv_escape(ua),
    sep = ","
  )
  cat(line, file = csv_path, append = TRUE, sep = "\n")

  list(ok = TRUE, received = received)
}
