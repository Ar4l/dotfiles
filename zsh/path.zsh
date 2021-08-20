# Append to $PATH-like, unless already present.
# If present, moves it to the end.
# See also: prepend_to().
function append_to() {
  local TARGET=$1
  local LOCATION=$2
  case "$TARGET" in
    INFOPATH)
      INFOPATH=${INFOPATH//":$LOCATION:"/:} # Delete (potentially multiple) from middle.
      INFOPATH=${INFOPATH/#"$LOCATION:"/} # Delete from start.
      INFOPATH=${INFOPATH/%":$LOCATION"/} # Delete from end.
      INFOPATH="${INFOPATH:+$INFOPATH:}$LOCATION" # Actually append (or if INFOPATH is empty, just set).
      ;;
    MANPATH)
      MANPATH=${MANPATH//":$LOCATION:"/:} # Delete (potentially multiple) from middle.
      MANPATH=${MANPATH/#"$LOCATION:"/} # Delete from start.
      MANPATH=${MANPATH/%":$LOCATION"/} # Delete from end.
      MANPATH="${MANPATH:+$MANPATH:}$LOCATION" # Actually append (or if MANPATH is empty, just set).
      ;;
    PATH)
      PATH=${PATH//":$LOCATION:"/:} # Delete (potentially multiple) from middle.
      PATH=${PATH/#"$LOCATION:"/} # Delete from start.
      PATH=${PATH/%":$LOCATION"/} # Delete from end.
      PATH="${PATH:+$PATH:}$LOCATION" # Actually append (or if PATH is empty, just set).
      ;;
  esac
}

# Prepend to $PATH-like, unless already present.
# If present, moves it to the start.
# See also: append_to().
function prepend_to() {
  local TARGET=$1
  local LOCATION=$2
  case "$TARGET" in
    INFOPATH)
      INFOPATH=${INFOPATH//":$LOCATION:"/:} # Delete (potentially multiple) from middle.
      INFOPATH=${INFOPATH/#"$LOCATION:"/} # Delete from start.
      INFOPATH=${INFOPATH/%":$LOCATION"/} # Delete from end.
      INFOPATH="$LOCATION${INFOPATH:+:$INFOPATH}" # Actually prepend (or if INFOPATH is empty, just set).
      ;;
    MANPATH)
      MANPATH=${MANPATH//":$LOCATION:"/:} # Delete (potentially multiple) from middle.
      MANPATH=${MANPATH/#"$LOCATION:"/} # Delete from start.
      MANPATH=${MANPATH/%":$LOCATION"/} # Delete from end.
      MANPATH="$LOCATION${MANPATH:+:$MANPATH}" # Actually prepend (or if MANPATH is empty, just set).
      ;;
    PATH)
      PATH=${PATH//":$LOCATION:"/:} # Delete (potentially multiple) from middle.
      PATH=${PATH/#"$LOCATION:"/} # Delete from start.
      PATH=${PATH/%":$LOCATION"/} # Delete from end.
      PATH="$LOCATION${PATH:+:$PATH}" # Actually prepend (or if PATH is empty, just set).
      ;;
  esac
}

if command -v gem &> /dev/null; then
  # Split string at ":".
  # Via: https://unix.stackexchange.com/a/614304
  for GEM_PATH ("${(s[:])$(gem env gempath)}"); do
    test -d "$GEM_PATH/bin" && append_to PATH "$GEM_PATH/bin"
  done
fi

if command -v yarn &> /dev/null; then
  append_to PATH "$(yarn global bin)"
fi

prepend_to PATH /usr/local/bin
prepend_to PATH /usr/local/sbin
if [[ -d "/usr/local/opt/python@3.8/libexec/bin" ]]; then
  prepend_to PATH "/usr/local/opt/python@3.8/libexec/bin"
fi

# On ARM Macs, Homebrew will use this instead of /usr/local.
test -d /opt/homebrew/sbin && prepend_to PATH /opt/homebrew/sbin
test -d /opt/homebrew/bin && prepend_to PATH /opt/homebrew/bin

test -d /opt/homebrew/share/man && prepend_to MANPATH /opt/homebrew/share/man
test -d /opt/homebrew/share/info && prepend_to INFOPATH /opt/homebrew/share/info

test -d /usr/local/opt/mysql@5.7 && prepend_to PATH /usr/local/opt/mysql@5.7/bin
test -d /usr/local/opt/llvm/bin && prepend_to PATH /usr/local/opt/llvm/bin
test -n "$N_PREFIX" && prepend_to PATH $N_PREFIX/bin

# If you ever want to see this in easy-to-read form: `echo $PATH | tr : '\n'`
export PATH
