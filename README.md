# Senior Enarc

This is a Senior Design project of Spring 2020 semester with the goals of
creating a more robust platform for approving, assigning, and appropriating
the projects assigned to all CS students for UTDallas. 

## Building/Installing Instructions (work in progress)
First you must have python3 and pip installed on your machine. You should also
have the pachage `venv` installed by running the following command:

```bash
pip3 install virtualenv
```

Then simply install all dependencies by running the following command:
```bash
python3 -m virtualenv .venv
source .venv/bin/activate # enter in the virtual environment
pip3 install -r requirements.txt
```

Note: the previous instructions may change. Also the setup.py process should be
used instead in the end.
