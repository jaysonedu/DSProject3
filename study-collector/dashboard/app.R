# Shiny dashboard: live view of data/submissions.csv written by plumber.R.
# From repo root: R -e "shiny::runApp('study-collector/dashboard', host='0.0.0.0', port=3838)"
# Open http://localhost:3838 while the Plumber API (port 8787) collects POSTs.

library(shiny)
library(utils)

# With shiny::runApp("study-collector/dashboard"), working directory is dashboard/.
csv_file <- normalizePath(
  file.path(dirname(getwd()), "data", "submissions.csv"),
  mustWork = FALSE
)

read_submissions <- function(path) {
  if (!file.exists(path) || file.info(path)$size == 0L) {
    return(data.frame())
  }
  tryCatch(
    read.csv(path, stringsAsFactors = FALSE, check.names = FALSE),
    error = function(e) data.frame()
  )
}

ui <- fluidPage(
  titlePanel("DS3 typing study — submissions"),
  fluidRow(
    column(
      4,
      h4("Counts (completed only)"),
      tableOutput("summary_tbl")
    ),
    column(
      8,
      h4("Latest rows"),
      tableOutput("raw_tbl")
    )
  ),
  helpText("CSV path: ", verbatimTextOutput("path_txt", placeholder = TRUE)),
  p(
    "Polls the CSV every 3s. Run ",
    code("study-collector/plumber.R"),
    " on port 8787 and set ",
    code("VITE_DS3_COLLECT_URL=http://localhost:8787/submit"),
    " in the frontend."
  )
)

server <- function(input, output, session) {
  output$path_txt <- renderText({
    csv_file
  })

  df <- reactivePoll(
    intervalMillis = 3000,
    session = session,
    checkFunc = function() {
      if (file.exists(csv_file)) file.info(csv_file)$mtime[1] else 0
    },
    valueFunc = function() {
      read_submissions(csv_file)
    }
  )

  output$summary_tbl <- renderTable({
    d <- df()
    if (nrow(d) == 0) return(NULL)
    comp <- d[tolower(d$event) == "completed", , drop = FALSE]
    if (nrow(comp) == 0) return(data.frame(note = "No completed rows yet"))
    vars <- split(comp$wpm, comp$variant)
    data.frame(
      variant = names(vars),
      n = vapply(vars, length, 0L),
      mean_wpm = vapply(vars, function(x) mean(x, na.rm = TRUE), 0)
    )
  }, striped = TRUE)

  output$raw_tbl <- renderTable({
    d <- df()
    if (nrow(d) == 0) return(NULL)
    tail(d, min(30L, nrow(d)))
  }, striped = TRUE)
}

shinyApp(ui, server)
