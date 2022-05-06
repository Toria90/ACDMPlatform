pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IERC20MintBurn.sol";

contract ERC20MintBurn is IERC20MintBurn,  AccessControl {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    bytes32 public constant MINT_BORN_ROLE = keccak256("MINT_BORN_ROLE");

    uint256 public totalSupply;

    string public name;
    string public symbol;
    uint8 public decimals;

    constructor(string memory _name, string memory _symbol, uint8 _decimals){
        name = _name;
        symbol = _symbol;
        decimals = _decimals;

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MINT_BORN_ROLE, _msgSender());
    }

    function balanceOf(address owner) public view returns (uint256){
        return _balances[owner];
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool){
        address owner = msg.sender;
        _approve(owner, spender, amount);
        return true;
    }

    function transfer(address to, uint256 value) public returns (bool){
        address from = msg.sender;
        _transfer(from, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool){
        address spender = msg.sender;
        if (from != spender) _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to address shouldn't be zero");
        require(amount != 0, "amount shouldn't be zero");

        uint256 fromBalance = _balances[from];
        require(fromBalance >= amount, "insufficient funds");
        _balances[from] = fromBalance - amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "account shouldn't be zero");
        require(amount != 0, "amount shouldn't be zero");

        totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "account shouldn't be zero");
        require(amount != 0, "amount shouldn't be zero");

        uint256 accountBalance = _balances[account];
        uint256 burnAmount = amount>accountBalance ? accountBalance : amount;
        _balances[account] = accountBalance - burnAmount;
        totalSupply -= burnAmount;

        emit Transfer(account, address(0), burnAmount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(spender != address(0), "spender address shouldn't be zero");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _spendAllowance(address owner, address spender, uint256 amount) internal {
        uint256 currentAllowance = allowance(owner, spender);
        require(currentAllowance >= amount, "insufficient allowance funds");
        _approve(owner, spender, currentAllowance - amount);
    }

    function mint(address account, uint256 amount) public onlyRole(MINT_BORN_ROLE) {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public onlyRole(MINT_BORN_ROLE) {
        _burn(account, amount);
    }
}