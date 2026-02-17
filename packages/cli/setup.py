from setuptools import setup, find_packages

setup(
    name='pingos-cli',
    version='0.1.0',
    description='PingOS CLI — control browser tabs from the terminal',
    packages=find_packages(),
    install_requires=['click'],
    entry_points={
        'console_scripts': [
            'pingos=pingos_cli.main:cli',
        ],
    },
    python_requires='>=3.8',
)
